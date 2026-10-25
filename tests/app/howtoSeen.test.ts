import { describe, it, expect, beforeEach } from 'vitest';
import { HOWTO_KEY, markHowtoSeen, resetHowtoMemo, shouldShowHowto } from '../../src/app/howto/seen';
import type { KeyValueStore } from '../../src/app/storage';

function mapStore(): KeyValueStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('遊び方を初回だけ出す', () => {
  beforeEach(() => resetHowtoMemo());

  it('何も保存されていなければ出す', () => {
    expect(shouldShowHowto(mapStore())).toBe(true);
  });

  it('見たあとは出さず、保存に印が残る', () => {
    const st = mapStore();
    markHowtoSeen(st);
    expect(shouldShowHowto(st)).toBe(false);
    expect(st.m.get(HOWTO_KEY)).toBe('1');
  });

  it('保存が何も覚えなくても、同じ起動の中では2回目は出さない', () => {
    const forgetful: KeyValueStore = { getItem: () => null, setItem: () => {} };
    markHowtoSeen(forgetful);
    expect(shouldShowHowto(forgetful)).toBe(false);
  });

  it('保存の読み書きが例外を投げても落ちない', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('x'); },
      setItem: () => { throw new Error('x'); },
    };
    expect(shouldShowHowto(broken)).toBe(true);
    expect(() => markHowtoSeen(broken)).not.toThrow();
    expect(shouldShowHowto(broken)).toBe(false);
  });
});
