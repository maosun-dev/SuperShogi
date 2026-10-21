import { test, expect } from 'vitest';

// lib に DOM がないので、console の型は最小のものを自前で宣言する
declare const console: { log(...args: unknown[]): void };
import { LEVELS, chooseCpuAction, type Level } from '../../src/ai/levels';
import { makeRng } from '../../src/ai/random';
import { validateDeck } from '../../src/cards';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { idx } from '../../src/rules/board';
import type { GameState } from '../../src/rules/types';
import { giveCard, put } from '../helpers';

const LV: Level[] = ['weak', 'normal', 'strong'];

// でたらめに60手進めた中盤の局面（双方 normal の持ち込み）
function midgame(): GameState {
  const rand = makeRng(3);
  let s = createGame({ sente: LEVELS.normal.deck, gote: LEVELS.normal.deck });
  for (let i = 0; i < 60 && !s.result; i++) {
    const acts = legalActions(s);
    s = applyAction(s, acts[Math.floor(rand() * acts.length)]).state;
  }
  return s;
}

test('どの強さの持ち込みも validateDeck を通る', () => {
  for (const l of LV) expect(validateDeck(LEVELS[l].deck)).toBeNull();
});

test('強い方が深く・迷いが少ない', () => {
  expect(LEVELS.weak.maxDepth).toBeLessThanOrEqual(LEVELS.normal.maxDepth);
  expect(LEVELS.normal.maxDepth).toBeLessThanOrEqual(LEVELS.strong.maxDepth);
  expect(LEVELS.weak.noise).toBeGreaterThanOrEqual(LEVELS.normal.noise);
  expect(LEVELS.normal.noise).toBeGreaterThanOrEqual(LEVELS.strong.noise);
});

// 壁時計で測るので、ほかのテストと同時に走ると混雑で数ms延びることがある。上限は毎回そのまま測る（retry で再測定）
test.each(LV)('時間内に答える（初期局面と中盤）: %s', level => {
  const start = createGame({ sente: LEVELS.normal.deck, gote: LEVELS.normal.deck });
  const mid = midgame();
  for (const [name, s] of [['初期', start], ['中盤', mid]] as const) {
    if (s.result) continue;
    const t0 = Date.now();
    const r = chooseCpuAction(viewFor(s, s.turn), s.turn, level, 1);
    const ms = Date.now() - t0;
    console.log(`[時間] ${level} ${name}: ${ms}ms depth=${r.depth} nodes=${r.nodes}`);
    expect(ms).toBeLessThanOrEqual(LEVELS[level].timeLimitMs + 200);
    expect(() => applyAction(s, r.action)).not.toThrow();
  }
}, { timeout: 30_000, retry: 2 });

// 壁時計で測るので、ほかのテストと同時に走ると混雑で数ms延びることがある。上限は毎回そのまま測る（retry で再測定）
test('手の数が膨らむ局面でも時間内', () => {
  const s = createGame({ sente: LEVELS.normal.deck, gote: LEVELS.normal.deck });
  giveCard(s, 'sente', 'irekae');
  giveCard(s, 'sente', 'irekae');
  const h = s.players.sente.hand;
  for (const k of ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] as const) h[k] = 1;
  s.board[idx({ c: 4, r: 4 })] = null;
  put(s, { c: 4, r: 4 }, 'HI', 'sente', { promoted: true, equip: 'idaten' });
  s.turn = 'sente';
  const t0 = Date.now();
  const r = chooseCpuAction(viewFor(s, 'sente'), 'sente', 'strong', 1);
  const ms = Date.now() - t0;
  console.log(`[時間] strong 膨らむ局面: ${ms}ms depth=${r.depth} nodes=${r.nodes}`);
  expect(ms).toBeLessThanOrEqual(LEVELS.strong.timeLimitMs + 200);
}, { timeout: 30_000, retry: 2 });
