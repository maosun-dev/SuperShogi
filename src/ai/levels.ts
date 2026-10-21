// CPU の強さ3段階：読む深さ・わざと迷う度合い・わざと悪い手の割合・持ち込みカード
import type { CardId, GameState, Side } from '../rules/types';
import { legalActions } from '../rules/game';
import { CARDS } from '../cards';
import { search, type SearchOptions, type SearchResult } from './search';
import { makeRng } from './random';

export type Level = 'weak' | 'normal' | 'strong';
export const TRAP_BEFORE_SHARE = 0.6; // 忍札を伏せられるうちは、時間のこの割合で考える
export const TRAP_AFTER_SHARE = 0.4;  // 伏せたあとの、続けて指す手
export interface LevelConfig extends Omit<SearchOptions, 'seed' | 'now'> {
  deck: CardId[];
  blunder: number;   // この割合で、読まずに駒を動かす手からでたらめに選ぶ（王を取れるときは除く）
}

// 持ち込みは計画8の数字で決め直す
export const LEVELS: Record<Level, LevelConfig> = {
  weak: {
    maxDepth: 1, timeLimitMs: 300, qDepth: 1, cardPlies: 1, cardWidth: 4, noise: 250, blunder: 0.15,
    deck: ['oshikaeshi', 'yobimodoshi', 'otoshiana', 'tenma'],
  },
  normal: {
    maxDepth: 3, timeLimitMs: 1000, qDepth: 4, cardPlies: 1, cardWidth: 6, noise: 30, blunder: 0,
    deck: ['rakurai', 'hagane', 'yobimodoshi'],
  },
  strong: {
    maxDepth: 6, timeLimitMs: 3000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 4, blunder: 0,
    deck: ['itetsuku', 'aiuchi', 'tsuranuki', 'hagane', 'oshikaeshi'],
  },
};

// view は viewFor(本当の局面, side) で作った「見えている情報」だけの局面。
// timeScale は考える時間の倍率（CPU 同士を戦わせる道具で短くするため。アプリでは1）
export function chooseCpuAction(view: GameState, side: Side, level: Level, seed: number, timeScale = 1): SearchResult {
  const { deck: _deck, blunder, ...opts } = LEVELS[level];
  if (blunder > 0) {
    const rng = makeRng(seed ^ 0x5bd1e995);
    if (rng() < blunder) {
      const acts = legalActions(view);
      const kingTake = acts.some(a => a.type === 'move' && view.board[a.to.r * 9 + a.to.c]?.kind === 'OU');
      const moves = acts.filter(a => a.type === 'move');
      if (!kingTake && moves.length > 0) {
        return { action: moves[Math.floor(rng() * moves.length)], score: 0, depth: 0, nodes: 0 };
      }
    }
  }
  // 忍札は伏せても手番が続くので、伏せる手と続けて指す手で1手番の時間を分ける（合わせて timeLimitMs まで）
  const canSetTrap = !view.trapSetThisTurn
    && view.players[side].cards.some(c => !c.used && CARDS[c.cardId].kind === 'trap');
  const share = view.trapSetThisTurn ? TRAP_AFTER_SHARE : canSetTrap ? TRAP_BEFORE_SHARE : 1;
  return search(view, side, { ...opts, timeLimitMs: Math.max(20, opts.timeLimitMs * timeScale * share), seed });
}
