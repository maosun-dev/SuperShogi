// 設定・前回の持ち込み・戦績の保存（localStorage が使えなくても動く）
import type { CardId, Handicap, HandicapKind } from '../rules/types';
import { HANDICAP_LABEL } from '../rules/board';
import type { Level } from '../ai/levels';
import { sanitizeDeck } from '../cards';
import { isNativeApp, mirrorStore, nativePrefs } from './native';
import { isKingFx, type KingFxChoice } from '../fx/kingfx/kinds';

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
export type StageId = 'kabuki' | 'ukiyoe' | 'byobu';
export type Motion = 'auto' | 'full' | 'low'; // auto は端末の「動きを減らす」に合わせる
// volume は 0〜1。stage は背景の舞台、motion は背景の動き
/** 対局の曲：決めた1曲か、毎局どちらか（random） */
export type BgmChoice = 'taikyoku' | 'taikyoku2' | 'sakura' | 'random';
// kingFx は王を取る・取られる演出（決めた1案か毎局くじ）
export interface Settings { fx: 'short' | 'long'; volume: number; stage: StageId; motion: Motion; bgm: BgmChoice; kingFx: KingFxChoice }
export interface Tally { wins: number; losses: number; draws: number }
// 稽古の相手：強さと、持ち込みの札（決めた並びか、毎局引き直す 'kuji'）
export interface Keiko { level: Level; deck: CardId[] | 'kuji' }
export const DEFAULT_KEIKO: Keiko = { level: 'normal', deck: 'kuji' };

export const DEFAULT_SETTINGS: Settings = { fx: 'long', volume: 0.7, stage: 'kabuki', motion: 'auto', bgm: 'taikyoku', kingFx: 'random' };

const KEY_SETTINGS = 'superShogi.settings';
const KEY_DECK = 'superShogi.deck';
const KEY_TALLY = 'superShogi.tally';
const KEY_HANDICAP = 'superShogi.handicap';
const KEY_KEIKO = 'superShogi.keiko';
// アプリで消えにくい保存領域にも写す鍵の一覧
export const SAVE_KEYS = [KEY_SETTINGS, KEY_DECK, KEY_TALLY, KEY_HANDICAP, KEY_KEIKO] as const;
export const NO_HANDICAP: Handicap = { side: 'sente', kind: 'none' };
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
  const stage = o.stage === 'kabuki' || o.stage === 'ukiyoe' || o.stage === 'byobu' ? o.stage : DEFAULT_SETTINGS.stage;
  const motion = o.motion === 'auto' || o.motion === 'full' || o.motion === 'low' ? o.motion : DEFAULT_SETTINGS.motion;
  const bgm = o.bgm === 'taikyoku' || o.bgm === 'taikyoku2' || o.bgm === 'sakura' || o.bgm === 'random' ? o.bgm : DEFAULT_SETTINGS.bgm;
  const kingFx = o.kingFx === 'random' || isKingFx(o.kingFx) ? o.kingFx : DEFAULT_SETTINGS.kingFx;
  return { fx, volume, stage, motion, bgm, kingFx };
}

export function saveSettings(st: KeyValueStore, s: Settings): void {
  st.setItem(KEY_SETTINGS, JSON.stringify(s));
}

// 今のルールで組めない持ち込みは null
export function loadDeck(st: KeyValueStore): CardId[] | null {
  const j = readJson(st, KEY_DECK);
  if (!Array.isArray(j) || !j.every(x => typeof x === 'string')) return null;
  return sanitizeDeck(j as string[]);
}

export function saveDeck(st: KeyValueStore, deck: CardId[]): void {
  st.setItem(KEY_DECK, JSON.stringify(deck));
}

// 駒落ちの設定。壊れていたら「なし」
export function loadHandicap(st: KeyValueStore): Handicap {
  const j = readJson(st, KEY_HANDICAP);
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const kind = typeof o.kind === 'string' && Object.hasOwn(HANDICAP_LABEL, o.kind) ? o.kind as HandicapKind : 'none';
  const side = o.side === 'gote' ? 'gote' : 'sente';
  return { side, kind };
}

export function saveHandicap(st: KeyValueStore, h: Handicap): void {
  st.setItem(KEY_HANDICAP, JSON.stringify(h));
}

// 稽古の相手。壊れていたら既定、今の決まりで組めない札は外す
export function loadKeiko(st: KeyValueStore): Keiko {
  const j = readJson(st, KEY_KEIKO);
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  if (o.level !== 'weak' && o.level !== 'normal' && o.level !== 'strong') return { ...DEFAULT_KEIKO };
  if (o.deck === 'kuji') return { level: o.level, deck: 'kuji' };
  if (!Array.isArray(o.deck) || !o.deck.every(x => typeof x === 'string')) return { ...DEFAULT_KEIKO };
  return { level: o.level, deck: sanitizeDeck(o.deck as string[]) };
}

export function saveKeiko(st: KeyValueStore, k: Keiko): void {
  st.setItem(KEY_KEIKO, JSON.stringify(k));
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
