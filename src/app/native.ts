// iPhone アプリ（Capacitor）だけの保存まわり。Web 版では何もしない。
// iPhone は容量が足りないときなどに WKWebView の localStorage を消すことがあるので、
// 保存の鍵（SAVE_KEYS）だけ、消えにくいアプリの保存領域（Preferences）にも同じ内容を書いておく。
// 両パッケージは Node でも読み込むだけなら落ちないので、静的に読み込む（遅延読み込みは使わない）。
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SAVE_KEYS, safeStoreRaw, type KeyValueStore } from './storage';

export interface PrefsLike {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

const isSaveKey = (k: string): boolean => (SAVE_KEYS as readonly string[]).includes(k);

// アプリの中なら true。読み込みや判定に失敗したら false（Web 扱い）
export function isNativeApp(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// localStorage にない鍵だけ Preferences から戻し、ある鍵は Preferences へ写す（導入前の保存の引き継ぎも兼ねる）。
// Preferences の失敗は握りつぶす（保存の1件ごとに独立して試す）
export async function restoreSaves(ls: KeyValueStore, prefs: PrefsLike): Promise<void> {
  let saved: string[] = [];
  try { saved = (await prefs.keys()).keys; } catch { /* 無いものとして進める */ }
  for (const k of SAVE_KEYS) {
    try {
      const mine = ls.getItem(k);
      if (mine !== null) {
        await prefs.set({ key: k, value: mine });
      } else if (saved.includes(k)) {
        const { value } = await prefs.get({ key: k });
        if (value !== null) ls.setItem(k, value);
      }
    } catch { /* この鍵は諦めて次へ */ }
  }
}

// 読むのは ls から。書くときは ls に書き、保存の鍵なら Preferences にも書く（待たない・失敗は握る）
export function mirrorStore(ls: KeyValueStore, prefs: PrefsLike): KeyValueStore {
  return {
    getItem: k => ls.getItem(k),
    setItem: (k, v) => {
      ls.setItem(k, v);
      if (!isSaveKey(k)) return;
      try { prefs.set({ key: k, value: v }).catch(() => { /* 保存できなくても続ける */ }); } catch { /* 同上 */ }
    },
  };
}

// 起動時に呼ぶ。アプリのときだけ本物の Preferences で戻す。Web では何もしない
export async function prepareSaves(): Promise<void> {
  if (!isNativeApp()) return;
  await restoreSaves(safeStoreRaw(), Preferences);
}

// アプリのときの safeStore が使う本物の Preferences
export function nativePrefs(): PrefsLike { return Preferences; }
