import { test, expect } from 'vitest';
import { evaluate, material } from '../../src/ai/evaluate';
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
  put(s, { c: 6, r: 2 }, 'KE', 'gote', { equip: 'hikijin' });
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
  expect(material(s, 'sente')).toBeCloseTo(1300 + 600 * 1.1);
});

test('カードは未使用だけ数える', () => {
  const s = emptyState();
  giveCard(s, 'sente', 'rakurai');
  const u = giveCard(s, 'sente', 'oshikaeshi');
  s.players.sente.cards.find(c => c.uid === u)!.used = true;
  expect(material(s, 'sente')).toBe(4 * 80);
});

test('装備と罠', () => {
  const s = emptyState();
  put(s, { c: 4, r: 6 }, 'GI', 'sente', { equip: 'hagane' });
  expect(material(s, 'sente')).toBe(500 + 350);
  // 伏せた罠（カードは使用済み扱い）
  const u = giveCard(s, 'sente', 'kagami');
  s.players.sente.cards.find(c => c.uid === u)!.used = true;
  setTrap(s, 'sente', 'kagami');
  expect(material(s, 'sente')).toBe(500 + 350 + 3 * 100);
  // 後手から見た局面では伏せ札が隠れ、未使用カードとして見える
  expect(material(viewFor(s, 'gote'), 'sente')).toBe(500 + 350 + 3 * 80);
});

test('落とし穴の上乗せ', () => {
  const s = emptyState();
  put(s, { c: 4, r: 4 }, 'FU', 'gote'); // 後手の歩は r+1 方向へ進む
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 5 });
  // 歩の駒価値（後手）を除いた先手側の点数を、後手から見た符号で確認する
  expect(material(s, 'sente')).toBe(2 * 100 + 100 - 100);
  const t = emptyState();
  put(t, { c: 4, r: 4 }, 'FU', 'gote');
  setTrap(t, 'sente', 'otoshiana', { c: 0, r: 8 });
  expect(material(t, 'sente')).toBe(2 * 100 - 100);
});

test('王だけが動ける落とし穴は上乗せしない', () => {
  const s = emptyState();
  put(s, { c: 4, r: 4 }, 'OU', 'gote');
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 5 });
  expect(material(s, 'sente')).toBe(2 * 100);
});

test('王の隣に味方がいる方が高い', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 0, r: 4 }, 'KI', 'sente');
  const far = evaluate(s, 'sente');
  const t = emptyState();
  put(t, { c: 4, r: 8 }, 'OU', 'sente');
  put(t, { c: 4, r: 0 }, 'OU', 'gote');
  put(t, { c: 3, r: 7 }, 'KI', 'sente');
  expect(evaluate(t, 'sente')).toBeGreaterThan(far);
});

test('相手の王の周りに利きが多い方が高い', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 0 }, 'OU', 'gote');
  put(s, { c: 8, r: 6 }, 'HI', 'sente');
  const far = evaluate(s, 'sente');
  const t = emptyState();
  put(t, { c: 4, r: 8 }, 'OU', 'sente');
  put(t, { c: 4, r: 0 }, 'OU', 'gote');
  put(t, { c: 8, r: 1 }, 'HI', 'sente'); // 2段目を横に利かせる
  expect(evaluate(t, 'sente')).toBeGreaterThan(far);
});

test('凍った駒・成れない飛車・重りの枷は、その駒の持ち主に損', () => {
  const base = () => { const s = emptyState(); put(s, { c: 4, r: 4 }, 'HI', 'sente'); return s; };
  const plain = material(base(), 'sente');
  const f = base(); f.board[4 * 9 + 4]!.frozen = 2;
  expect(material(f, 'sente')).toBeCloseTo(plain - 1000 * 0.15 * 2);
  const g = base(); g.board[4 * 9 + 4]!.sealed = true;
  expect(material(g, 'sente')).toBe(plain - 150);
  const h = base(); h.board[4 * 9 + 4]!.equip = { cardId: 'omori' };
  expect(material(h, 'sente')).toBe(plain - 400);
});
