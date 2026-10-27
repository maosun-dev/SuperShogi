// 稽古：相手の強さと持ち込み札を自分で決める対局。札は決めた並びか「くじ」（札見せのたびに引き直す）。
// 稽古は練習なので戦績に数えない
import type { CardId } from '../rules/types';
import { isLevel, LEVELS, type Level } from '../ai/levels';
import { autoDeck } from './deck';
import { LEVEL_NAME } from './outcome';
import type { Keiko } from './storage';

export { DEFAULT_KEIKO, type Keiko } from './storage';

// 相手の持ち込みを決める。稽古でなければ強さごとの札（鬼・傾奇者はその範囲からくじ）、稽古のくじなら rng で組む
export function drawFoeDeck(level: Level, keiko: Keiko | undefined, rng: () => number): CardId[] {
  if (!keiko) {
    const { kuji, kujiGuard, deck } = LEVELS[level];
    // 守りの札を1枚決めてから、残りをくじの範囲で埋める（鬼）
    const start = kujiGuard ? [kujiGuard[Math.floor(rng() * kujiGuard.length)]] : [];
    if (kuji) return kuji === 'all' ? autoDeck(rng, undefined, start) : autoDeck(rng, kuji, start);
    return [...deck];
  }
  return keiko.deck === 'kuji' ? autoDeck(rng) : [...keiko.deck];
}

// 相手の呼び名（札見せ・結果画面）
export function foeLabel(level: Level, keiko?: Keiko): string {
  return keiko ? `稽古・${LEVEL_NAME[level]}` : LEVEL_NAME[level];
}

// 画面から画面へ渡された値を確かめる（変な値は稽古でないとみなす）
export function keikoOf(v: unknown): Keiko | undefined {
  const o = v as Partial<Keiko> | undefined;
  if (!o || !isLevel(o.level)) return undefined;
  if (o.deck === 'kuji') return { level: o.level, deck: 'kuji' };
  return Array.isArray(o.deck) ? { level: o.level, deck: [...o.deck] } : undefined;
}
