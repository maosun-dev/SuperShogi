import { test, expect } from 'vitest';
import { applyAction, createGame } from '../../src/rules/game';
import { filterEventsFor, viewFor } from '../../src/rules/view';
import type { GameEvent } from '../../src/rules/types';
import { emptyState, giveCard, put, setTrap } from '../helpers';

test('viewFor で相手の罠の cardId と at が null になる。自分の罠はそのまま', () => {
  const s = emptyState();
  const mine = setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  const theirs = setTrap(s, 'gote', 'otoshiana', { c: 3, r: 5 });
  const v = viewFor(s, 'sente');
  expect(v.traps).toContainEqual({ uid: mine, owner: 'sente', cardId: 'otoshiana', at: { c: 4, r: 4 } });
  expect(v.traps).toContainEqual({ uid: theirs, owner: 'gote', cardId: null, at: null });
  // 元の局面は変わらない
  expect(s.traps[1]).toMatchObject({ cardId: 'otoshiana', at: { c: 3, r: 5 } });
});

test('viewFor：伏せたままの相手の罠カードは「使用済み」に見えない（中身の手がかりを出さない）', () => {
  const s = createGame({ sente: [], gote: ['kagami', 'narifuuji'] });
  s.turn = 'gote';
  const kagami = s.players.gote.cards[0].uid;
  const r = applyAction(s, { type: 'card', uid: kagami, targets: [] });
  const v = viewFor(r.state, 'sente');
  expect(v.players.gote.cards.every(c => !c.used)).toBe(true);
  expect(JSON.stringify(v)).not.toContain('"cardId":"kagami","at"');
  // 自分から見れば使用済み
  expect(viewFor(r.state, 'gote').players.gote.cards[0].used).toBe(true);
});

test('viewFor：発動して消えた罠のカードは使用済みのまま見える', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 4 }, 'GI', 'gote');
  const k = giveCard(s, 'gote', 'kagami');
  s.players.gote.cards[0].used = true;
  setTrap(s, 'gote', 'kagami');
  const rak = giveCard(s, 'sente', 'rakurai');
  const r = applyAction(s, { type: 'card', uid: rak, targets: [{ c: 4, r: 4 }] });
  expect(viewFor(r.state, 'sente').players.gote.cards.find(c => c.uid === k)!.used).toBe(true);
});

test('filterEventsFor で相手の trapSet の cardId と at が null になる', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  const uid = giveCard(s, 'sente', 'otoshiana');
  const { events } = applyAction(s, { type: 'card', uid, targets: [{ c: 4, r: 4 }] });
  const seen = filterEventsFor(events, 'gote');
  const set = seen.find(e => e.type === 'trapSet')!;
  expect(set).toMatchObject({ side: 'sente', cardId: null, at: null });
  expect(JSON.stringify(seen)).not.toContain('"c":4,"r":4');
  // 元の出来事は変わらない
  expect(events.find(e => e.type === 'trapSet')).toMatchObject({ cardId: 'otoshiana', at: { c: 4, r: 4 } });
});

test('filterEventsFor は自分の trapSet と、発動した trapTriggered を隠さない', () => {
  const events: GameEvent[] = [
    { type: 'trapSet', side: 'sente', uid: 1, cardId: 'otoshiana', at: { c: 1, r: 1 } },
    { type: 'trapTriggered', owner: 'gote', uid: 2, cardId: 'otoshiana', at: { c: 2, r: 2 } },
  ];
  expect(filterEventsFor(events, 'sente')).toEqual(events);
});
