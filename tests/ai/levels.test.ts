import { describe, test, expect } from 'vitest';

// lib に DOM がないので、console の型は最小のものを自前で宣言する
declare const console: { log(...args: unknown[]): void };
import { JOMAKU, LEVEL_IDS, LEVELS, OOZUME, chooseCpuAction, isLevel, type Level } from '../../src/ai/levels';
import { makeRng } from '../../src/ai/random';
import { validateDeck } from '../../src/cards';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { idx } from '../../src/rules/board';
import type { GameState } from '../../src/rules/types';
import { emptyState, giveCard, put } from '../helpers';

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
  expect(LEVELS.strong.deck).toEqual(['itetsuku', 'aiuchi', 'tsuranuki', 'hagane']);
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

test('押し返しの続きは、伏せたあとと同じ短い時間で考える', () => {
  const s = createGame({ sente: ['otoshiana'], gote: [] });
  const t = { ...s, pushFollowUp: true };
  const t1 = Date.now();
  chooseCpuAction(viewFor(t, 'sente'), 'sente', 'strong', 1);
  expect(Date.now() - t1).toBeLessThanOrEqual(LEVELS.strong.timeLimitMs * 0.4 + 200);
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

test('よわいは、ときどき読まずに指す（種を変えると手がばらつく）。ふつう・つよいは乱れない', () => {
  expect(LEVELS.weak.blunder).toBeGreaterThan(0);
  expect(LEVELS.normal.blunder).toBe(0);
  expect(LEVELS.strong.blunder).toBe(0);
  const s = createGame({ sente: [], gote: [] });
  const picks = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) picks.add(JSON.stringify(chooseCpuAction(s, 'sente', 'weak', seed).action));
  expect(picks.size).toBeGreaterThan(3);
});

test('どの強さでも、取れる王は取る', () => {
  for (const level of LV) {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame({ sente: [], gote: [] });
      // 後手の王の前に先手の金を置く
      s.board[idx({ c: 4, r: 1 })] = { id: 999, kind: 'KI', side: 'sente', promoted: false, equip: null };
      const r = chooseCpuAction(s, 'sente', level, seed);
      const after = applyAction(s, r.action).state;
      expect(after.result).toEqual({ winner: 'sente', reason: 'king-captured' });
      if (level !== 'weak') break; // 乱れるのはよわいだけなので、ほかは1回でよい
    }
  }
}, 60_000);

test('忍札を伏せられるうちと伏せたあとで、1手番の時間を分ける（合わせて時間の上限まで）', () => {
  const s = createGame({ sente: ['otoshiana', 'kagami'], gote: [] });
  const t0 = Date.now();
  chooseCpuAction(viewFor(s, 'sente'), 'sente', 'strong', 1);
  const before = Date.now() - t0;
  const t = { ...s, trapSetThisTurn: true };
  const t1 = Date.now();
  chooseCpuAction(viewFor(t, 'sente'), 'sente', 'strong', 1);
  const after = Date.now() - t1;
  expect(before).toBeLessThanOrEqual(LEVELS.strong.timeLimitMs * 0.6 + 200);
  expect(after).toBeLessThanOrEqual(LEVELS.strong.timeLimitMs * 0.4 + 200);
}, { timeout: 30_000, retry: 2 });

test('押し返しの風で相手の角を自分の桂の利きへ押し込み、続けて取る（ふつう）', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 3 }, 'KA', 'gote');
  put(s, { c: 3, r: 4 }, 'KE', 'sente');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const r1 = chooseCpuAction(viewFor(s, 'sente'), 'sente', 'normal', 1);
  expect(r1.action).toEqual({ type: 'card', uid, targets: [{ c: 4, r: 3 }] });
  const s2 = applyAction(s, r1.action).state;
  const r2 = chooseCpuAction(viewFor(s2, 'sente'), 'sente', 'normal', 1);
  expect(r2.action).toMatchObject({ type: 'move', from: { c: 3, r: 4 }, to: { c: 4, r: 2 } });
}, 30_000);

// 序幕の3つは、速くする前の作りが時間いっぱいに読めた量を上限にして、強さを今のまま保つ
test('序幕の3つには読む量の上限があり、弱い ≤ ふつう ≤ 強い', () => {
  for (const l of LV) expect(LEVELS[l].maxNodes).toBeGreaterThan(0);
  expect(LEVELS.weak.maxNodes!).toBeLessThanOrEqual(LEVELS.normal.maxNodes!);
  expect(LEVELS.normal.maxNodes!).toBeLessThanOrEqual(LEVELS.strong.maxNodes!);
});

test('読む量の上限は、考える時間と同じ割合で縮む（考える時間の倍率）', () => {
  const s = midgame();
  const view = viewFor(s, s.turn);
  const full = chooseCpuAction(view, s.turn, 'strong', 5, 1);
  const half = chooseCpuAction(view, s.turn, 'strong', 5, 0.5);
  // 上限か時間のどちらかで止まる。どちらでも、上限（根の候補を読み終えるまでは2倍）を超えない
  expect(full.nodes).toBeLessThanOrEqual(LEVELS.strong.maxNodes! * 2 + 200);
  expect(half.nodes).toBeLessThanOrEqual(LEVELS.strong.maxNodes! * 0.5 * 2 + 200);
}, 60_000);

describe('大詰の3人', () => {
  test('強さは6つ。序幕の3つ→大詰の3つの順', () => {
    expect(LEVEL_IDS).toEqual(['weak', 'normal', 'strong', 'oni', 'shihan', 'kabuki']);
    expect(JOMAKU).toEqual(['weak', 'normal', 'strong']);
    expect(OOZUME).toEqual(['oni', 'shihan', 'kabuki']);
  });
  test('isLevel は6つの id だけを通す', () => {
    for (const l of LEVEL_IDS) expect(isLevel(l)).toBe(true);
    for (const v of ['hard', undefined, 3, null, 'Oni']) expect(isLevel(v)).toBe(false);
  });
  test('考える時間は 鬼3秒・師範4秒・傾奇者5秒。読む量の上限は付けない', () => {
    expect([LEVELS.oni.timeLimitMs, LEVELS.shihan.timeLimitMs, LEVELS.kabuki.timeLimitMs]).toEqual([3000, 4000, 5000]);
    for (const l of OOZUME) expect(LEVELS[l].maxNodes).toBeUndefined();
  });
  test('札：師範は決まった6枚（コスト10）、鬼は攻めの10種類からくじ、傾奇者は全部からくじ', () => {
    expect(LEVELS.shihan.deck).toEqual(['kagami', 'narifuuji', 'hagane', 'itetsuku', 'hikijin', 'oshikaeshi']);
    expect(validateDeck(LEVELS.shihan.deck)).toBeNull();
    expect(LEVELS.shihan.kuji).toBeUndefined();
    expect(LEVELS.oni.kuji).toEqual(['rakurai', 'oshikaeshi', 'irekae', 'shoryu', 'kakuotoshi', 'yobimodoshi', 'idaten', 'tsuranuki', 'tenma', 'omori']);
    expect(LEVELS.kabuki.kuji).toBe('all');
  });
});
