import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, safeStore, loadSettings, saveSettings, loadDeck, saveDeck,
  loadTally, recordResult, type KeyValueStore,
} from '../../src/app/storage';

// Map で作った偽の保存先
function fakeStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('保存', () => {
  it('設定を保存して読み戻せる', () => {
    const st = fakeStore();
    saveSettings(st, { fx: 'short', volume: 0.3 });
    expect(loadSettings(st)).toEqual({ fx: 'short', volume: 0.3 });
  });
  it('何もなければ既定の設定', () => {
    expect(loadSettings(fakeStore())).toEqual(DEFAULT_SETTINGS);
  });
  it('壊れた JSON や変な値は既定に戻る', () => {
    const st = fakeStore();
    st.setItem('superShogi.settings', '{');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    st.setItem('superShogi.settings', '{"fx":"fast","volume":"大"}');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    st.setItem('superShogi.settings', '{"fx":"short","volume":3}');
    expect(loadSettings(st)).toEqual({ fx: 'short', volume: 1 });
  });
  it('持ち込みを保存して読み戻せる', () => {
    const st = fakeStore();
    saveDeck(st, ['rakurai', 'idaten']);
    expect(loadDeck(st)).toEqual(['rakurai', 'idaten']);
  });
  it('今は組めない持ち込みは null', () => {
    const st = fakeStore();
    expect(loadDeck(st)).toBeNull();
    st.setItem('superShogi.deck', JSON.stringify(['rakurai', 'rakurai', 'rakurai']));
    expect(loadDeck(st)).toBeNull();
    st.setItem('superShogi.deck', JSON.stringify(['nazo']));
    expect(loadDeck(st)).toBeNull();
    st.setItem('superShogi.deck', '{');
    expect(loadDeck(st)).toBeNull();
  });
  it('戦績は強さごとに数える', () => {
    const st = fakeStore();
    recordResult(st, 'weak', 'win');
    recordResult(st, 'weak', 'win');
    recordResult(st, 'strong', 'loss');
    expect(loadTally(st, 'weak')).toEqual({ wins: 2, losses: 0, draws: 0 });
    expect(loadTally(st, 'strong')).toEqual({ wins: 0, losses: 1, draws: 0 });
    expect(loadTally(st, 'normal')).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
  it('localStorage がなくても動く', () => {
    const st = safeStore();
    saveSettings(st, { fx: 'short', volume: 0.5 });
    expect(loadSettings(st)).toEqual({ fx: 'short', volume: 0.5 });
  });
});
