import { test, expect } from 'vitest';
import { createGame, applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import { IllegalActionError } from '../../src/rules/types';
import type { Action, GameState, Square } from '../../src/rules/types';
import { emptyState, put } from '../helpers';

const mv = (from: Square, to: Square, promote = false): Action => ({ type: 'move', from, to, promote });
const noDecks = { sente: [], gote: [] };

test('初手 7六歩（{2,6}→{2,5}）で手番が後手になり、moved が出る', () => {
  const s = createGame(noDecks);
  const { state, events } = applyAction(s, mv({ c: 2, r: 6 }, { c: 2, r: 5 }));
  expect(state.turn).toBe('gote');
  expect(state.ply).toBe(1);
  expect(events).toContainEqual(expect.objectContaining({ type: 'moved', from: { c: 2, r: 6 }, to: { c: 2, r: 5 } }));
  expect(state.board[idx({ c: 2, r: 5 })]).toMatchObject({ kind: 'FU', side: 'sente' });
  expect(state.board[idx({ c: 2, r: 6 })]).toBeNull();
});

test('applyAction は元の局面を変えない', () => {
  const s = createGame(noDecks);
  const before = JSON.stringify(s);
  applyAction(s, mv({ c: 2, r: 6 }, { c: 2, r: 5 }));
  expect(JSON.stringify(s)).toBe(before);
});

test('相手の駒を取ると、成りを戻して持ち駒に入る', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 5 }, 'FU', 'sente');
  const gi = put(s, { c: 4, r: 4 }, 'GI', 'gote', { promoted: true });
  const { state, events } = applyAction(s, mv({ c: 4, r: 5 }, { c: 4, r: 4 }));
  expect(state.players.sente.hand.GI).toBe(1);
  expect(events).toContainEqual({ type: 'captured', pieceId: gi.id, at: { c: 4, r: 4 }, by: 'sente' });
});

test('王を取ったら勝ち、そのあとの行動は IllegalActionError', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 4 }, 'OU', 'gote');
  put(s, { c: 4, r: 5 }, 'FU', 'sente');
  const { state, events } = applyAction(s, mv({ c: 4, r: 5 }, { c: 4, r: 4 }));
  expect(state.result).toEqual({ winner: 'sente', reason: 'king-captured' });
  expect(events.at(-1)).toEqual({ type: 'gameOver', result: { winner: 'sente', reason: 'king-captured' } });
  expect(legalActions(state)).toEqual([]);
  expect(() => applyAction(state, mv({ c: 4, r: 8 }, { c: 4, r: 7 }))).toThrow(IllegalActionError);
});

function checkedPosition(): GameState {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 1 }, 'HI', 'gote');
  put(s, { c: 8, r: 6 }, 'FU', 'sente');
  return s;
}

test('王手を放置する手も合法', () => {
  const s = checkedPosition();
  const a = mv({ c: 8, r: 6 }, { c: 8, r: 5 });
  expect(legalActions(s)).toContainEqual(a);
  const { state } = applyAction(s, a);
  expect(state.turn).toBe('gote');
});

test('王手をかけると check が出る', () => {
  const s = emptyState('gote');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 3, r: 1 }, 'HI', 'gote');
  const { events } = applyAction(s, mv({ c: 3, r: 1 }, { c: 4, r: 1 }));
  expect(events).toContainEqual({ type: 'check', side: 'sente' });
});

test('成りが必須の手に promote:false を渡すと IllegalActionError', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 8 }, 'OU', 'gote');
  put(s, { c: 4, r: 1 }, 'FU', 'sente');
  expect(() => applyAction(s, mv({ c: 4, r: 1 }, { c: 4, r: 0 }, false))).toThrow(IllegalActionError);
  const { state } = applyAction(s, mv({ c: 4, r: 1 }, { c: 4, r: 0 }, true));
  expect(state.board[idx({ c: 4, r: 0 })]).toMatchObject({ kind: 'FU', promoted: true });
});

test('成れる手は promote:true と false の両方が legalActions にある', () => {
  const s = emptyState();
  put(s, { c: 4, r: 3 }, 'GI', 'sente');
  const acts = legalActions(s);
  expect(acts).toContainEqual(mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true));
  expect(acts).toContainEqual(mv({ c: 4, r: 3 }, { c: 4, r: 2 }, false));
});

test('legalActions の初期局面は30手', () => {
  expect(legalActions(createGame(noDecks))).toHaveLength(30);
});

test('持ち駒を打つと持ち駒が減り、dropped が出る', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  s.players.sente.hand.KI = 2;
  const { state, events } = applyAction(s, { type: 'drop', kind: 'KI', to: { c: 4, r: 4 } });
  expect(state.players.sente.hand.KI).toBe(1);
  expect(state.board[idx({ c: 4, r: 4 })]).toMatchObject({ kind: 'KI', side: 'sente', promoted: false });
  expect(events).toContainEqual(expect.objectContaining({ type: 'dropped', side: 'sente', kind: 'KI', to: { c: 4, r: 4 } }));
});

test('持っていない駒は打てない', () => {
  const s = emptyState();
  expect(() => applyAction(s, { type: 'drop', kind: 'KI', to: { c: 4, r: 4 } })).toThrow(IllegalActionError);
});

test('同じ局面が4回で repetition の引き分け', () => {
  let s = createGame(noDecks);
  const cycle = [
    mv({ c: 3, r: 8 }, { c: 3, r: 7 }), mv({ c: 3, r: 0 }, { c: 3, r: 1 }),
    mv({ c: 3, r: 7 }, { c: 3, r: 8 }), mv({ c: 3, r: 1 }, { c: 3, r: 0 }),
  ];
  let last: ReturnType<typeof applyAction> | null = null;
  for (let i = 0; i < 12; i++) {
    expect(s.result).toBeNull();
    last = applyAction(s, cycle[i % 4]);
    s = last.state;
  }
  expect(s.result).toEqual({ winner: null, reason: 'repetition' });
  expect(last!.events.at(-1)).toEqual({ type: 'gameOver', result: { winner: null, reason: 'repetition' } });
});

test('301手目のあとで move-limit の引き分け', () => {
  const s = createGame(noDecks);
  s.ply = 299;
  const a = applyAction(s, mv({ c: 2, r: 6 }, { c: 2, r: 5 })).state;
  expect(a.result).toBeNull();
  const b = applyAction(a, mv({ c: 2, r: 2 }, { c: 2, r: 3 })).state;
  expect(b.ply).toBe(301);
  expect(b.result).toEqual({ winner: null, reason: 'move-limit' });
});

test('相手の手番の駒は動かせない', () => {
  const s = createGame(noDecks);
  expect(() => applyAction(s, mv({ c: 2, r: 2 }, { c: 2, r: 3 }))).toThrow(IllegalActionError);
});

// ---------- 駒落ち ----------

const kinds = (s: GameState, side: 'sente' | 'gote') =>
  s.board.filter(p => p && p.side === side).map(p => p!.kind).sort().join(',');

test('駒落ちなし（none）は平手と同じで先手から', () => {
  const s = createGame(noDecks, { handicap: { side: 'gote', kind: 'none' } });
  expect(s.turn).toBe('sente');
  expect(s.board.filter(Boolean)).toHaveLength(40);
});

test('香落ち：落とす側から見て左の香がなくなり、落とした側が先に指す', () => {
  const s = createGame(noDecks, { handicap: { side: 'sente', kind: 'kyo' } });
  expect(s.board[idx({ c: 0, r: 8 })]).toBeNull();
  expect(s.board[idx({ c: 8, r: 8 })]?.kind).toBe('KY');
  expect(s.turn).toBe('sente');
  const g = createGame(noDecks, { handicap: { side: 'gote', kind: 'kyo' } });
  expect(g.board[idx({ c: 8, r: 0 })]).toBeNull();
  expect(g.board[idx({ c: 0, r: 0 })]?.kind).toBe('KY');
  expect(g.turn).toBe('gote');
});

test('駒落ちの種類ごとに消える駒', () => {
  const want: Record<string, string[]> = {
    kaku: ['KA'], hisha: ['HI'], hikyo: ['HI', 'KY'], nimai: ['HI', 'KA'],
    yonmai: ['HI', 'KA', 'KY', 'KY'], rokumai: ['HI', 'KA', 'KY', 'KY', 'KE', 'KE'],
  };
  const full = kinds(createGame(noDecks), 'gote').split(',');
  for (const [kind, gone] of Object.entries(want)) {
    const s = createGame(noDecks, { handicap: { side: 'gote', kind: kind as never } });
    const rest = [...full];
    for (const k of gone) rest.splice(rest.indexOf(k), 1);
    expect(kinds(s, 'gote')).toBe(rest.join(','));
    expect(kinds(s, 'sente')).toBe(full.join(','));
    expect(s.turn).toBe('gote');
    // 後手の角は (7,1)、飛車は (1,1)
    if (gone.includes('KA')) expect(s.board[idx({ c: 7, r: 1 })]).toBeNull();
    if (gone.includes('HI')) expect(s.board[idx({ c: 1, r: 1 })]).toBeNull();
  }
});
