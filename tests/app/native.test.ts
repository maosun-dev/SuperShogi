import { describe, it, expect, vi } from 'vitest';
import { isNativeApp, restoreSaves, mirrorStore, prepareSaves, type PrefsLike } from '../../src/app/native';
import {
  DEFAULT_SETTINGS, SAVE_KEYS, safeStore, loadSettings, saveSettings, type KeyValueStore,
} from '../../src/app/storage';

function fakeStore(init: Record<string, string> = {}): KeyValueStore & { m: Map<string, string> } {
  const m = new Map<string, string>(Object.entries(init));
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
// Map で作った偽の Preferences
function fakePrefs(init: Record<string, string> = {}): PrefsLike & { m: Map<string, string> } {
  const m = new Map<string, string>(Object.entries(init));
  return {
    m,
    get: async ({ key }) => ({ value: m.get(key) ?? null }),
    set: async ({ key, value }) => { m.set(key, value); },
    keys: async () => ({ keys: [...m.keys()] }),
  };
}
// 何をしても失敗する偽の Preferences
const brokenPrefs: PrefsLike = {
  get: () => Promise.reject(new Error('x')),
  set: () => Promise.reject(new Error('x')),
  keys: () => Promise.reject(new Error('x')),
};
const [KS, KD, KT, KH] = [
  'superShogi.settings', 'superShogi.deck', 'superShogi.tally', 'superShogi.handicap',
];

describe('消えにくい保存', () => {
  it('保存の鍵は設定・持ち込み・戦績・駒落ち・稽古の相手・遊び方を見たかの6つ', () => {
    expect([...SAVE_KEYS].sort()).toEqual([KD, KS, KT, KH, 'superShogi.keiko', 'superShogi.howtoSeen'].sort());
  });
  it('localStorage にない鍵だけ戻す', async () => {
    const ls = fakeStore({ [KS]: 'LS' });
    const prefs = fakePrefs({ [KS]: 'PREF', [KT]: 'T' });
    await restoreSaves(ls, prefs);
    expect(ls.m.get(KS)).toBe('LS');
    expect(ls.m.get(KT)).toBe('T');
  });
  it('localStorage にある鍵は Preferences へ写す', async () => {
    const ls = fakeStore({ [KD]: '["a"]' });
    const prefs = fakePrefs();
    await restoreSaves(ls, prefs);
    expect(prefs.m.get(KD)).toBe('["a"]');
  });
  it('書くたびに両方へ。保存の鍵でないものは Preferences に書かない', async () => {
    const ls = fakeStore();
    const prefs = fakePrefs();
    const st = mirrorStore(ls, prefs);
    saveSettings(st, { fx: 'short', volume: 0.2, stage: 'kabuki', motion: 'auto', bgm: 'taikyoku', kingFx: 'random' });
    st.setItem('x', '1');
    await Promise.resolve();
    expect(ls.m.get(KS)).toBe(prefs.m.get(KS));
    expect(prefs.m.has(KS)).toBe(true);
    expect(ls.m.get('x')).toBe('1');
    expect(prefs.m.has('x')).toBe(false);
  });
  it('Preferences が失敗しても止まらない', async () => {
    const ls = fakeStore({ [KS]: '{}' });
    await expect(restoreSaves(ls, brokenPrefs)).resolves.toBeUndefined();
    const st = mirrorStore(ls, brokenPrefs);
    expect(() => st.setItem(KS, 'v')).not.toThrow();
    expect(ls.m.get(KS)).toBe('v');
    await Promise.resolve();
  });
  it('壊れた値が戻っても既定で起動', async () => {
    const ls = fakeStore();
    await restoreSaves(ls, fakePrefs({ [KS]: '{' }));
    expect(loadSettings(ls)).toEqual(DEFAULT_SETTINGS);
  });
  it('Web では何もしない', async () => {
    expect(isNativeApp()).toBe(false);
    await expect(prepareSaves()).resolves.toBeUndefined();
    const st = safeStore();
    st.setItem('superShogi.test', 'ok');
    expect(st.getItem('superShogi.test')).toBe('ok');
  });
  it('壊れた JSON の手元は、Preferences の正常な値で戻す（上書きしない）', async () => {
    const ls = fakeStore({ [KS]: '{' });
    const good = JSON.stringify({ fx: 'short', volume: 0.1 });
    const prefs = fakePrefs({ [KS]: good });
    await restoreSaves(ls, prefs);
    expect(ls.m.get(KS)).toBe(good);
    expect(prefs.m.get(KS)).toBe(good);
  });
  it('Preferences が固まっても上限の時間で終わる', async () => {
    vi.useFakeTimers();
    try {
      const hang = new Promise<never>(() => {});
      const stuck: PrefsLike = { get: () => hang, set: () => hang, keys: () => hang };
      let done = false;
      const p = restoreSaves(fakeStore(), stuck, 1500).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(1499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await p;
      expect(done).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
