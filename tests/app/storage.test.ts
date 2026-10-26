import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, safeStore, loadSettings, saveSettings, loadDeck, saveDeck,
  loadTally, recordResult, loadHandicap, saveHandicap, loadLevelAct, saveLevelAct, SAVE_KEYS, type KeyValueStore,
} from '../../src/app/storage';

// Map で作った偽の保存先
function fakeStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('保存', () => {
  it('駒落ちを保存して読み戻せる。何もない・壊れているときは「なし」', () => {
    const st = fakeStore();
    expect(loadHandicap(st)).toEqual({ side: 'sente', kind: 'none' });
    saveHandicap(st, { side: 'gote', kind: 'nimai' });
    expect(loadHandicap(st)).toEqual({ side: 'gote', kind: 'nimai' });
    st.setItem('superShogi.handicap', '{"kind":"toString","side":"x"}');
    expect(loadHandicap(st)).toEqual({ side: 'sente', kind: 'none' });
    st.setItem('superShogi.handicap', '{');
    expect(loadHandicap(st)).toEqual({ side: 'sente', kind: 'none' });
  });
  it('設定を保存して読み戻せる', () => {
    const st = fakeStore();
    saveSettings(st, { fx: 'short', volume: 0.3, stage: 'byobu', motion: 'low', bgm: 'random', kingFx: 'iai' });
    expect(loadSettings(st)).toEqual({ fx: 'short', volume: 0.3, stage: 'byobu', motion: 'low', bgm: 'random', kingFx: 'iai' });
  });
  it('対局の曲は最初は対局BGM1。前の版の保存（bgm なし）や変な値も対局BGM1', () => {
    expect(DEFAULT_SETTINGS.bgm).toBe('taikyoku');
    const st = fakeStore();
    st.setItem('superShogi.settings', '{"fx":"short","volume":0.5,"stage":"kabuki","motion":"auto"}');
    expect(loadSettings(st).bgm).toBe('taikyoku');
    st.setItem('superShogi.settings', '{"bgm":"taikyoku2"}');
    expect(loadSettings(st).bgm).toBe('taikyoku2');
    st.setItem('superShogi.settings', '{"bgm":"rock"}');
    expect(loadSettings(st).bgm).toBe('taikyoku');
  });
  it('何もなければ既定の設定（舞台は歌舞伎、背景の動きは端末に合わせる）', () => {
    expect(loadSettings(fakeStore())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ stage: 'kabuki', motion: 'auto' });
  });
  it('壊れた JSON や変な値は既定に戻る', () => {
    const st = fakeStore();
    st.setItem('superShogi.settings', '{');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    st.setItem('superShogi.settings', '{"fx":"fast","volume":"大"}');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    st.setItem('superShogi.settings', '{"fx":"short","volume":3}');
    expect(loadSettings(st)).toEqual({ ...DEFAULT_SETTINGS, fx: 'short', volume: 1 });
    st.setItem('superShogi.settings', '{"stage":"toString","motion":"fast"}');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
  });
  it('持ち込みを保存して読み戻せる', () => {
    const st = fakeStore();
    saveDeck(st, ['rakurai', 'idaten']);
    expect(loadDeck(st)).toEqual(['rakurai', 'idaten']);
  });
  it('今は組めない持ち込みは、組めない札だけ外して読む', () => {
    const st = fakeStore();
    expect(loadDeck(st)).toBeNull();
    st.setItem('superShogi.deck', JSON.stringify(['tate', 'rakurai', 'rakurai']));
    expect(loadDeck(st)).toEqual(['rakurai']);
    st.setItem('superShogi.deck', JSON.stringify(['nazo']));
    expect(loadDeck(st)).toEqual([]);
    st.setItem('superShogi.deck', JSON.stringify([1, 2]));
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
    saveSettings(st, { ...DEFAULT_SETTINGS, fx: 'short', volume: 0.5 });
    expect(loadSettings(st)).toEqual({ ...DEFAULT_SETTINGS, fx: 'short', volume: 0.5 });
  });
});

describe('強さ選びの幕', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('保存が無い・壊れているときは序幕', () => {
    const st = mem();
    expect(loadLevelAct(st)).toBe('jo');
    st.setItem('superShogi.levelAct', '"xx"');
    expect(loadLevelAct(st)).toBe('jo');
    st.setItem('superShogi.levelAct', '{');
    expect(loadLevelAct(st)).toBe('jo');
  });
  it('大詰を選ぶと覚えておく', () => {
    const st = mem();
    saveLevelAct(st, 'oo');
    expect(loadLevelAct(st)).toBe('oo');
  });
  it('アプリの消えにくい保存にも写す鍵に入っている', () => {
    expect(SAVE_KEYS).toContain('superShogi.levelAct');
  });
});
