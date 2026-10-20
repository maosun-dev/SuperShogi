import { test, expect } from 'vitest';
import { evaluate } from '../../src/ai/evaluate';
import { createGame } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { emptyState, put, giveCard, setTrap } from '../helpers';

test('初期局面で同じカードなら0点', () => {
  const s = createGame({ sente: ['rakurai'], gote: ['rakurai'] });
  expect(evaluate(s, 'sente')).toBe(0);
});

test('向きを変えると符号が逆', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 2, r: 6 }, 'KA', 'sente');
  put(s, { c: 6, r: 2 }, 'KE', 'gote', { equip: 'tate' });
  put(s, { c: 1, r: 1 }, 'FU', 'gote', { promoted: true });
  s.players.sente.hand.GI = 2;
  giveCard(s, 'gote', 'rakurai');
  setTrap(s, 'sente', 'kagami');
  expect(evaluate(s, 'sente')).toBe(-evaluate(s, 'gote'));
});

test('成り駒と持ち駒', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 0, r: 4 }, 'HI', 'sente', { promoted: true });
  s.players.sente.hand.KI = 1;
  expect(evaluate(s, 'sente')).toBeCloseTo(1300 + 600 * 1.1);
});

test('カードは未使用だけ数える', () => {
  const s = emptyState();
  giveCard(s, 'sente', 'rakurai');
  const u = giveCard(s, 'sente', 'oshikaeshi');
  s.players.sente.cards.find(c => c.uid === u)!.used = true;
  expect(evaluate(s, 'sente')).toBe(4 * 80);
});

test('装備と罠', () => {
  const s = emptyState();
  put(s, { c: 4, r: 6 }, 'GI', 'sente', { equip: 'hagane' });
  expect(evaluate(s, 'sente')).toBe(500 + 350);
  // 伏せた罠（カードは使用済み扱い）
  const u = giveCard(s, 'sente', 'kagami');
  s.players.sente.cards.find(c => c.uid === u)!.used = true;
  setTrap(s, 'sente', 'kagami');
  expect(evaluate(s, 'sente')).toBe(500 + 350 + 3 * 100);
  // 後手から見た局面では伏せ札が隠れ、未使用カードとして見える
  expect(evaluate(viewFor(s, 'gote'), 'sente')).toBe(500 + 350 + 3 * 80);
});

test('落とし穴の上乗せ', () => {
  const s = emptyState();
  put(s, { c: 4, r: 4 }, 'FU', 'gote'); // 後手の歩は r+1 方向へ進む
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 5 });
  // 歩の駒価値（後手）を除いた先手側の点数を、後手から見た符号で確認する
  expect(evaluate(s, 'sente')).toBe(2 * 100 + 100 - 100);
  const t = emptyState();
  put(t, { c: 4, r: 4 }, 'FU', 'gote');
  setTrap(t, 'sente', 'otoshiana', { c: 0, r: 8 });
  expect(evaluate(t, 'sente')).toBe(2 * 100 - 100);
});

test('王だけが動ける落とし穴は上乗せしない', () => {
  const s = emptyState();
  put(s, { c: 4, r: 4 }, 'OU', 'gote');
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 5 });
  expect(evaluate(s, 'sente')).toBe(2 * 100);
});
