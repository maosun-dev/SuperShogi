import { describe, test, expect } from 'vitest';
import { evaluate, material, positional } from '../../src/ai/evaluate';
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
  const h = base(); h.board[4 * 9 + 4]!.shackle = { left: 3 };
  expect(material(h, 'sente')).toBe(plain - 400);
});

test('重りの枷：残りの手番が少ないほど持ち主の損が小さい', () => {
  const mk = (left: number) => {
    const s = emptyState();
    put(s, { c: 4, r: 8 }, 'OU', 'sente');
    put(s, { c: 4, r: 0 }, 'OU', 'gote');
    const p = put(s, { c: 4, r: 2 }, 'HI', 'gote');
    p.shackle = { left };
    return evaluate(s, 'gote');
  };
  expect(mk(1)).toBeGreaterThan(mk(3));
});

describe('賢くした見方（positional）', () => {
  const base = () => {
    const s = emptyState('sente');
    put(s, { c: 4, r: 0 }, 'OU', 'gote');
    return s;
  };
  test('初期配置では 0（先後が同じ形）', () => {
    expect(positional(createGame({ sente: [], gote: [] }), 'sente')).toBe(0);
  });
  test('evaluate(s, side, true) は evaluate(s, side) に positional を足したもの', () => {
    const s = createGame({ sente: [], gote: [] });
    s.board[6 * 9 + 2] = null; // 先手の 7七の歩を消す
    expect(evaluate(s, 'sente', true)).toBe(evaluate(s, 'sente') + positional(s, 'sente'));
  });
  test('王は自陣の奥・端寄りが高く、中央の5段目に出ると低い', () => {
    const deep = base(); put(deep, { c: 7, r: 8 }, 'OU', 'sente');
    const center = base(); put(center, { c: 4, r: 4 }, 'OU', 'sente');
    expect(positional(deep, 'sente')).toBeGreaterThan(positional(center, 'sente'));
  });
  test('金銀を王のそばに寄せると高い', () => {
    const near = base(); put(near, { c: 7, r: 8 }, 'OU', 'sente'); put(near, { c: 6, r: 7 }, 'KI', 'sente'); put(near, { c: 7, r: 7 }, 'GI', 'sente');
    const far = base(); put(far, { c: 7, r: 8 }, 'OU', 'sente'); put(far, { c: 1, r: 7 }, 'KI', 'sente'); put(far, { c: 1, r: 6 }, 'GI', 'sente');
    expect(positional(near, 'sente')).toBeGreaterThan(positional(far, 'sente'));
  });
  test('王の逃げ道（相手の利きが無く、味方もいない隣のマス）が多いほど高い', () => {
    const open = base(); put(open, { c: 4, r: 7 }, 'OU', 'sente');
    const shut = base(); put(shut, { c: 4, r: 7 }, 'OU', 'sente'); put(shut, { c: 4, r: 2 }, 'HI', 'gote'); put(shut, { c: 0, r: 7 }, 'HI', 'gote');
    // 相手の飛車2枚の分の駒の点は positional に入らない（駒の点は material）
    expect(positional(open, 'sente')).toBeGreaterThan(positional(shut, 'sente'));
  });
  test('前に出た歩に少し点（敵陣の手前まで）', () => {
    const back = base(); put(back, { c: 7, r: 8 }, 'OU', 'sente'); put(back, { c: 0, r: 6 }, 'FU', 'sente');
    const fwd = base(); put(fwd, { c: 7, r: 8 }, 'OU', 'sente'); put(fwd, { c: 0, r: 4 }, 'FU', 'sente');
    const deep = base(); put(deep, { c: 7, r: 8 }, 'OU', 'sente'); put(deep, { c: 0, r: 1 }, 'FU', 'sente');
    expect(positional(fwd, 'sente')).toBeGreaterThan(positional(back, 'sente'));
    // 歩の前進は1段5点・3段まで（7段目から4段目まで）。2段目まで出ても3段ぶん
    expect(positional(deep, 'sente') - positional(back, 'sente')).toBe(15);
    expect(positional(fwd, 'sente') - positional(back, 'sente')).toBe(10);
  });
  test('王がいない盤でも落ちない', () => {
    const s = emptyState('sente');
    put(s, { c: 0, r: 6 }, 'FU', 'sente');
    expect(Number.isFinite(positional(s, 'sente'))).toBe(true);
  });
});

test('3マスまでの飛車は300低く、痺れた駒は凍った駒と同じだけ低い（2026-10）', () => {
  const base = () => { const s = emptyState(); put(s, { c: 4, r: 4 }, 'HI', 'sente'); return s; };
  const plain = material(base(), 'sente');
  const r = base(); r.board[4 * 9 + 4]!.reach = 3;
  expect(material(r, 'sente')).toBe(plain - 300);
  const n = base(); n.board[4 * 9 + 4]!.numb = 1;
  const f = base(); f.board[4 * 9 + 4]!.frozen = 1;
  expect(material(n, 'sente')).toBeCloseTo(material(f, 'sente'));
});
