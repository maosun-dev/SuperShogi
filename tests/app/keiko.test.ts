import { describe, it, expect } from 'vitest';
import { DEFAULT_KEIKO, drawFoeDeck, foeLabel } from '../../src/app/keiko';
import { loadKeiko, saveKeiko, loadTally, type KeyValueStore } from '../../src/app/storage';
import { validateDeck } from '../../src/cards';
import { LEVELS } from '../../src/ai/levels';
import { makeRng } from '../../src/ai/random';

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
