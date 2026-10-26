import { test, expect } from 'vitest';
import { cardCandidates, search, WIN, type SearchOptions } from '../../src/ai/search';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import type { Action, GameState } from '../../src/rules/types';
import { emptyState, put, giveCard } from '../helpers';

const BASE: SearchOptions = { maxDepth: 2, timeLimitMs: 5000, qDepth: 4, cardPlies: 1, cardWidth: 8, noise: 0, seed: 1 };

test('取れる王は取る', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 1 }, 'OU', 'gote');
  put(s, { c: 4, r: 2 }, 'KI', 'sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  const r = search(s, 'sente', BASE);
  expect(r.action).toEqual({ type: 'move', from: { c: 4, r: 2 }, to: { c: 4, r: 1 }, promote: false });
  expect(r.score).toBeGreaterThanOrEqual(WIN - 1);
});

test('ただで取れる飛車を取る', () => {
  const s = emptyState('sente');
  put(s, { c: 2, r: 4 }, 'HI', 'gote');
  put(s, { c: 2, r: 5 }, 'GI', 'sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 8, r: 0 }, 'OU', 'gote');
  for (const maxDepth of [1, 2]) {
    const r = search(s, 'sente', { ...BASE, maxDepth });
    expect(r.action.type).toBe('move');
    if (r.action.type !== 'move') return;
    expect(r.action.from).toEqual({ c: 2, r: 5 });
    expect(r.action.to).toEqual({ c: 2, r: 4 });
  }
});

test('王の前の駒をどけない', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 7 }, 'KI', 'sente');
  put(s, { c: 4, r: 0 }, 'HI', 'gote');
  put(s, { c: 3, r: 6 }, 'FU', 'gote');
  put(s, { c: 8, r: 0 }, 'OU', 'gote');
  const r = search(s, 'sente', BASE);
  // 選んだ手のあとも、先手の金は筋4に残っている（動かさない手でもよい）
  const after = applyAction(s, r.action).state;
  const gold = after.board.findIndex(p => p?.kind === 'KI' && p.side === 'sente');
  expect(gold).toBeGreaterThanOrEqual(0);
  expect(gold % 9).toBe(4);
  expect(r.score).toBeGreaterThan(-WIN / 2);
});

test('落雷で王を救う', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 7 }, 'KI', 'gote');
  put(s, { c: 4, r: 6 }, 'GI', 'gote');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  const uid = giveCard(s, 'sente', 'rakurai');
  const r = search(s, 'sente', BASE);
  expect(r.action).toEqual({ type: 'card', uid, targets: [{ c: 4, r: 7 }] });
});

// 本当の局面で後手が罠を2枚伏せる（落とし穴・鏡の結界）
function realWithTraps(): GameState {
  let s = createGame({ sente: ['rakurai', 'oshikaeshi'], gote: ['otoshiana', 'kagami'] });
  const play = (a: Action) => { s = applyAction(s, a).state; };
  play({ type: 'move', from: { c: 2, r: 6 }, to: { c: 2, r: 5 }, promote: false });
  const pit = s.players.gote.cards.find(c => c.cardId === 'otoshiana')!;
  play({ type: 'card', uid: pit.uid, targets: [{ c: 2, r: 4 }] });
  play({ type: 'move', from: { c: 6, r: 2 }, to: { c: 6, r: 3 }, promote: false }); // 伏せても手番は続く
  play({ type: 'move', from: { c: 6, r: 6 }, to: { c: 6, r: 5 }, promote: false });
  const mirror = s.players.gote.cards.find(c => c.cardId === 'kagami')!;
  play({ type: 'card', uid: mirror.uid, targets: [] });
  play({ type: 'move', from: { c: 5, r: 2 }, to: { c: 5, r: 3 }, promote: false });
  return s;
}

test('伏せた相手の罠があっても本当の局面で合法', () => {
  const real = realWithTraps();
  expect(real.turn).toBe('sente');
  expect(real.traps.length).toBe(2);
  const r = search(viewFor(real, 'sente'), 'sente', BASE);
  expect(() => applyAction(real, r.action)).not.toThrow();
});

test('同じ種なら同じ手、ゆらぎがあっても合法', () => {
  const s = createGame({ sente: ['rakurai', 'kagami'], gote: ['rakurai', 'kagami'] });
  const a = search(s, 'sente', { ...BASE, noise: 300, seed: 7 });
  const b = search(s, 'sente', { ...BASE, noise: 300, seed: 7 });
  expect(b.action).toEqual(a.action);
  const legal = legalActions(s);
  for (let seed = 1; seed <= 10; seed++) {
    const r = search(s, 'sente', { ...BASE, noise: 300, seed });
    expect(legal).toContainEqual(r.action);
  }
});

test('時間で止まる', () => {
  const s = createGame({ sente: ['rakurai', 'kagami'], gote: ['rakurai', 'kagami'] });
  const t0 = Date.now();
  const r = search(s, 'sente', { ...BASE, maxDepth: 6, timeLimitMs: 300 });
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(500);
  expect(r.depth).toBeGreaterThanOrEqual(1);
});

test('終わった対局・指せる手がないときは例外', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  s.result = { winner: 'sente', reason: 'king-captured' };
  expect(() => search(s, 'sente', BASE)).toThrow('対局はもう終わっています');
  const empty = emptyState('sente');
  expect(() => search(empty, 'sente', BASE)).toThrow('指せる行動がありません');
});

test('手番でない側として頼まれたら例外', () => {
  const s = createGame({ sente: ['rakurai'], gote: ['rakurai'] });
  expect(s.turn).toBe('sente');
  expect(() => search(viewFor(s, 'gote'), 'gote', BASE)).toThrow('CPU の手番ではありません');
});

test('深さ1の途中でも時間切れなら、読み終えた手を返す', () => {
  const s = createGame({ sente: ['tenma'], gote: ['tenma'] });
  let calls = 0;
  const now = () => (++calls <= 2 ? 0 : 1e9);
  const r = search(s, 'sente', { ...BASE, maxDepth: 3, timeLimitMs: 100, now });
  expect(legalActions(s).some(a => JSON.stringify(a) === JSON.stringify(r.action))).toBe(true);
  expect(r.depth).toBe(1);
});

test('装備は価値の高い駒を優先して候補に入れる', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  for (let c = 0; c < 9; c++) put(s, { c, r: 6 }, 'FU', 'sente');
  put(s, { c: 7, r: 7 }, 'HI', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  giveCard(s, 'sente', 'hagane');
  const cands = cardCandidates(s, legalActions(s), 8);
  const targets = cands.map(c => (c.a.type === 'card' ? c.a.targets[0] : null));
  expect(targets).toContainEqual({ c: 7, r: 7 });
});

test('1枚のカードが候補の枠を独占しない', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  for (let c = 0; c < 9; c++) put(s, { c, r: 6 }, 'FU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  giveCard(s, 'sente', 'hagane');
  const kagami = giveCard(s, 'sente', 'kagami');
  const cands = cardCandidates(s, legalActions(s), 4);
  expect(cands.length).toBeLessThanOrEqual(4);
  expect(cands.some(c => c.a.type === 'card' && c.a.uid === kagami)).toBe(true);
});

test('頭金の1手詰め：深さ1でも、王手の延長で金を打つ手を見つける', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 2 }, 'FU', 'sente');
  s.players.sente.hand.KI = 1;
  const r = search(s, 'sente', { ...BASE, maxDepth: 1 });
  expect(r.action).toEqual({ type: 'drop', kind: 'KI', to: { c: 4, r: 1 } });
  expect(r.score).toBeGreaterThan(WIN - 100);
});

test('逃げられる王手は、勝ちと読まない', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  s.players.sente.hand.KI = 1;
  // 守りの歩がないので、王は金を取るか逃げられる
  const r = search(s, 'sente', { ...BASE, maxDepth: 2 });
  expect(r.score).toBeLessThan(WIN - 100);
});

test('1手で王を取られる局面では、逃げるか守る', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 3 }, 'HI', 'gote');   // 縦に王を狙う飛車
  put(s, { c: 0, r: 8 }, 'FU', 'sente');
  const r = search(s, 'sente', { ...BASE, maxDepth: 2 });
  expect(r.score).toBeGreaterThan(-(WIN - 100));
  const after = applyAction(s, r.action).state;
  expect(after.result).toBeNull();
  // 指したあと、後手が王を取れる手がない
  expect(legalActions(after).some(a => a.type === 'move' && after.board[a.to.r * 9 + a.to.c]?.kind === 'OU')).toBe(false);
});

test('対局で前に出た局面へ戻る手は、ほかに同じくらいの手があれば選ばない', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 6 }, 'KI', 'sente');
  const first = search(s, 'sente', { ...BASE, maxDepth: 2 });
  // その手のあとの局面を「前に出た」ことにすると、別の手を選ぶ
  const after = applyAction(s, first.action).state;
  const keyAfter = Object.keys(after.seen).find(k => !(k in s.seen))!;
  const again = search({ ...s, seen: { ...s.seen, [keyAfter]: 1 } }, 'sente', { ...BASE, maxDepth: 2 });
  expect(again.action).not.toEqual(first.action);
});

test('maxNodes に達したら打ち切り、それまでに読み終えた深さの手を返す', () => {
  const s = createGame({ sente: [], gote: [] });
  const r = search(s, 'sente', { ...BASE, maxDepth: 6, timeLimitMs: 60_000, maxNodes: 3000 });
  expect(r.nodes).toBeLessThan(3000 * 2 + 200);
  expect(r.depth).toBeGreaterThanOrEqual(1);
});

test('maxNodes があっても時間の上限は効く', () => {
  let t = 0;
  const now = () => (t += 10);
  const s = createGame({ sente: [], gote: [] });
  const r = search(s, 'sente', { ...BASE, maxDepth: 6, timeLimitMs: 100, maxNodes: 10_000_000, now });
  expect(r.depth).toBeLessThan(6);
});
