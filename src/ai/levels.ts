// CPU の強さ3段階：読む深さ・わざと迷う度合い・持ち込みカード
import type { CardId, GameState } from '../rules/types';
import { search, type SearchOptions, type SearchResult } from './search';

export type Level = 'weak' | 'normal' | 'strong';
export interface LevelConfig extends Omit<SearchOptions, 'seed' | 'now'> { deck: CardId[] }

// 最初の値。遊びながら調整する
export const LEVELS: Record<Level, LevelConfig> = {
  weak: {
    maxDepth: 1, timeLimitMs: 300, qDepth: 1, cardPlies: 1, cardWidth: 4, noise: 250,
    deck: ['oshikaeshi', 'yobimodoshi', 'narifuuji', 'tenma'],
  },
  normal: {
    maxDepth: 2, timeLimitMs: 1000, qDepth: 4, cardPlies: 1, cardWidth: 6, noise: 40,
    deck: ['rakurai', 'otoshiana', 'tenma', 'narifuuji', 'oshikaeshi'],
  },
  strong: {
    maxDepth: 4, timeLimitMs: 3000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 5,
    deck: ['rakurai', 'hagane', 'kagami'],
  },
};

// view は viewFor で作った「見えている情報」だけの局面
export function chooseCpuAction(view: GameState, level: Level, seed: number): SearchResult {
  const { deck: _deck, ...opts } = LEVELS[level];
  return search(view, { ...opts, seed });
}
