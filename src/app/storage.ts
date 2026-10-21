// 設定・前回の持ち込み・戦績の保存（localStorage が使えなくても動く）
import type { CardId } from '../rules/types';
import type { Level } from '../ai/levels';
import { validateDeck } from '../cards';
import { isNativeApp, mirrorStore, nativePrefs } from './native';

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface Settings { fx: 'short' | 'long'; volume: number } // volume は 0〜1
export interface Tally { wins: number; losses: number; draws: number }

export const DEFAULT_SETTINGS: Settings = { fx: 'long', volume: 0.7 };

const KEY_SETTINGS = 'superShogi.settings';
const KEY_DECK = 'superShogi.deck';
const KEY_TALLY = 'superShogi.tally';
// アプリで消えにくい保存領域にも写す鍵の一覧
export const SAVE_KEYS = [KEY_SETTINGS, KEY_DECK, KEY_TALLY] as const;
const LEVELS_ALL: Level[] = ['weak', 'normal', 'strong'];

// アプリのときだけ、保存の鍵を Preferences にも書く版を返す（Web ではこれまでどおり）
export function safeStore(): KeyValueStore {
  const st = safeStoreRaw();
  return isNativeApp() ? mirrorStore(st, nativePrefs()) : st;
}

// localStorage があればそれ、なければ（例外も含む）メモリの中だけの代わり
export function safeStoreRaw(): KeyValueStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      // 触れるかどうかを一度確かめる（拒否されていると例外になる）
      ls.getItem(KEY_SETTINGS);
      return {
        getItem: k => { try { return ls.getItem(k); } catch { return null; } },
        setItem: (k, v) => { try { ls.setItem(k, v); } catch { /* 保存できなくても続ける */ } },
      };
    }
  } catch { /* メモリの代わりへ */ }
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

// 壊れた JSON は undefined にする
function readJson(st: KeyValueStore, key: string): unknown {
  try {
    const raw = st.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch { return undefined; }
}

export function loadSettings(st: KeyValueStore): Settings {
  const j = readJson(st, KEY_SETTINGS);
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const fx = o.fx === 'short' || o.fx === 'long' ? o.fx : DEFAULT_SETTINGS.fx;
  const volume = typeof o.volume === 'number' && Number.isFinite(o.volume)
    ? Math.min(1, Math.max(0, o.volume)) : DEFAULT_SETTINGS.volume;
  return { fx, volume };
}

export function saveSettings(st: KeyValueStore, s: Settings): void {
  st.setItem(KEY_SETTINGS, JSON.stringify(s));
}

// 今のルールで組めない持ち込みは null
export function loadDeck(st: KeyValueStore): CardId[] | null {
  const j = readJson(st, KEY_DECK);
  if (!Array.isArray(j) || !j.every(x => typeof x === 'string')) return null;
  return validateDeck(j as CardId[]) === null ? (j as CardId[]) : null;
}

export function saveDeck(st: KeyValueStore, deck: CardId[]): void {
  st.setItem(KEY_DECK, JSON.stringify(deck));
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function loadAllTallies(st: KeyValueStore): Record<Level, Tally> {
  const j = readJson(st, KEY_TALLY);
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as Record<Level, Tally>;
  for (const lv of LEVELS_ALL) {
    const t = o[lv];
    out[lv] = { wins: count(t?.wins), losses: count(t?.losses), draws: count(t?.draws) };
  }
  return out;
}

export function loadTally(st: KeyValueStore, level: Level): Tally {
  return loadAllTallies(st)[level];
}

export function recordResult(st: KeyValueStore, level: Level, outcome: 'win' | 'loss' | 'draw'): Tally {
  const all = loadAllTallies(st);
  const t = all[level];
  if (outcome === 'win') t.wins++;
  else if (outcome === 'loss') t.losses++;
  else t.draws++;
  st.setItem(KEY_TALLY, JSON.stringify(all));
  return t;
}
