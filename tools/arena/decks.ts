// CPU 同士の対局の道具：強さごとの持ち込み。決まった札の強さはその札、くじの強さ（鬼・傾奇者）はアプリと同じくじで組む
import { LEVELS, type Level } from '../../src/ai/levels';
import { drawFoeDeck } from '../../src/app/keiko';
import type { CardId } from '../../src/rules/types';

export function deckFor(level: Level, rand: () => number): CardId[] {
  return LEVELS[level].kuji ? drawFoeDeck(level, undefined, rand) : [...LEVELS[level].deck];
}
