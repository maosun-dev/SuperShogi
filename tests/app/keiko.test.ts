import { describe, it, expect } from 'vitest';
import { DEFAULT_KEIKO, drawFoeDeck, foeLabel, keikoOf } from '../../src/app/keiko';
import { loadKeiko, saveKeiko, loadTally, recordResult, type KeyValueStore } from '../../src/app/storage';
import { CARDS, validateDeck } from '../../src/cards';
import { LEVELS } from '../../src/ai/levels';
import { makeRng } from '../../src/ai/random';
import type { CardId } from '../../src/rules/types';

function fakeStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('稽古：相手の決め方', () => {
  it('稽古でないときは、強さごとに決まった札', () => {
    expect(drawFoeDeck('strong', undefined, makeRng(1))).toEqual(LEVELS.strong.deck);
  });
  it('札を決めた稽古は、その札をそのまま使う', () => {
    expect(drawFoeDeck('weak', { level: 'weak', deck: ['rakurai', 'tenma'] }, makeRng(1))).toEqual(['rakurai', 'tenma']);
  });
  it('くじは引くたびに、決まりを守った札になる（同じ並びが続かない）', () => {
    const rng = makeRng(7);
    const decks = Array.from({ length: 20 }, () => drawFoeDeck('normal', { level: 'normal', deck: 'kuji' }, rng));
    for (const d of decks) expect(validateDeck(d)).toBeNull();
    expect(new Set(decks.map((d) => d.join())).size).toBeGreaterThan(1);
  });
  it('鬼・傾奇者は稽古でなくても毎回くじ（決まりを守り、鬼は守りの札1枚＋攻めの札）。師範は決まった6枚', () => {
    const rng = makeRng(11);
    const oni = Array.from({ length: 200 }, () => drawFoeDeck('oni', undefined, rng));
    for (const d of oni) {
      expect(validateDeck(d)).toBeNull();
      // 守りの札がちょうど1枚、残りは攻めの札
      expect(d.filter((id) => LEVELS.oni.kujiGuard!.includes(id))).toHaveLength(1);
      for (const id of d) expect([...(LEVELS.oni.kuji as string[]), ...LEVELS.oni.kujiGuard!]).toContain(id);
      expect(d.length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(oni.flatMap((d) => d.filter((id) => LEVELS.oni.kujiGuard!.includes(id)))).size).toBeGreaterThan(3);
    expect(new Set(oni.map((d) => d.join())).size).toBeGreaterThan(1);
    const kabuki = Array.from({ length: 200 }, () => drawFoeDeck('kabuki', undefined, rng));
    for (const d of kabuki) {
      expect(validateDeck(d)).toBeNull();
      // くじの範囲の札と、余ったときのコスト1の札だけ。鋼の鎧・韋駄天は入らない
      for (const id of d) expect([...(LEVELS.kabuki.kuji as string[]), ...LEVELS.kabuki.kujiFill!]).toContain(id);
      // 足す札は、くじの範囲の札で埋めきれなかったときだけ（足す札が入っていれば、範囲の札はもう1枚も入らない）
      const cost = (ids: string[]) => ids.reduce((n, id) => n + CARDS[id as CardId].cost, 0);
      if (d.some((id) => LEVELS.kabuki.kujiFill!.includes(id))) {
        const rest = (LEVELS.kabuki.kuji as CardId[]).filter((id) => !d.includes(id));
        for (const id of rest) expect(cost([...d.filter((x) => !LEVELS.kabuki.kujiFill!.includes(x)), id])).toBeGreaterThan(10);
      }
    }
    expect(new Set(kabuki.flat()).size).toBeGreaterThan(6);
    expect(kabuki.some((d) => d.some((id) => LEVELS.kabuki.kujiFill!.includes(id)))).toBe(true);
    expect(drawFoeDeck('shihan', undefined, rng)).toEqual(LEVELS.shihan.deck);
  });
  it('名前：大詰の3人', () => {
    expect(foeLabel('oni')).toBe('鬼');
    expect(foeLabel('shihan')).toBe('師範');
    expect(foeLabel('kabuki', { level: 'kabuki', deck: 'kuji' })).toBe('稽古・傾奇者');
  });
  it('稽古の値の確かめ：大詰の強さも通る', () => {
    expect(keikoOf({ level: 'shihan', deck: 'kuji' })).toEqual({ level: 'shihan', deck: 'kuji' });
    expect(keikoOf({ level: 'hard', deck: 'kuji' })).toBeUndefined();
  });
  it('稽古の保存：大詰の強さも往復する', () => {
    const st = fakeStore();
    saveKeiko(st, { level: 'kabuki', deck: ['rakurai'] });
    expect(loadKeiko(st)).toEqual({ level: 'kabuki', deck: ['rakurai'] });
  });
  it('戦績：大詰の強さも数える', () => {
    const st = fakeStore();
    recordResult(st, 'oni', 'win');
    expect(loadTally(st, 'oni')).toEqual({ wins: 1, losses: 0, draws: 0 });
    expect(loadTally(st, 'strong')).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
  it('名前：稽古なら強さを添える', () => {
    expect(foeLabel('strong')).toBe('強い');
    expect(foeLabel('strong', { level: 'strong', deck: 'kuji' })).toBe('稽古・強い');
  });
});

describe('稽古：保存', () => {
  it('何もない・壊れているときは既定（ふつう・くじ）', () => {
    const st = fakeStore();
    expect(loadKeiko(st)).toEqual(DEFAULT_KEIKO);
    st.setItem('superShogi.keiko', '{');
    expect(loadKeiko(st)).toEqual(DEFAULT_KEIKO);
    st.setItem('superShogi.keiko', '{"level":"oni","deck":5}');
    expect(loadKeiko(st)).toEqual(DEFAULT_KEIKO);
  });
  it('保存して読み戻せる。今の決まりで組めない札は外す', () => {
    const st = fakeStore();
    saveKeiko(st, { level: 'strong', deck: ['rakurai', 'hagane'] });
    expect(loadKeiko(st)).toEqual({ level: 'strong', deck: ['rakurai', 'hagane'] });
    saveKeiko(st, { level: 'weak', deck: 'kuji' });
    expect(loadKeiko(st)).toEqual({ level: 'weak', deck: 'kuji' });
    st.setItem('superShogi.keiko', '{"level":"normal","deck":["rakurai","nazo"]}');
    expect(loadKeiko(st)).toEqual({ level: 'normal', deck: ['rakurai'] });
  });
  it('稽古は強さの戦績を変えない（保存の鍵が別）', () => {
    const st = fakeStore();
    saveKeiko(st, { level: 'strong', deck: 'kuji' });
    expect(loadTally(st, 'strong')).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});
