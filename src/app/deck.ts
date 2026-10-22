// カード選びの計算と「おまかせ」
import type { CardId } from '../rules/types';
import { CARDS, COST_LIMIT, MAX_COPIES } from '../cards';

export function deckCost(deck: CardId[]): number {
  return deck.reduce((sum, id) => sum + CARDS[id].cost, 0);
}

// 足せない理由。足せるなら null
export function addReason(deck: CardId[], id: CardId): string | null {
  if (deck.filter(d => d === id).length >= MAX_COPIES) return '同じ札は1枚までです';
  if (deckCost(deck) + CARDS[id].cost > COST_LIMIT) return '残りのコストが足りません';
  return null;
}

// 全種類を1枚ずつ並べて rng で混ぜ、前から「入れてもコスト10以内」のものを足す
export function autoDeck(rng: () => number): CardId[] {
  const pool: CardId[] = [];
  for (const id of Object.keys(CARDS) as CardId[]) for (let i = 0; i < MAX_COPIES; i++) pool.push(id);
  // フィッシャー–イェーツの混ぜ方（rng が同じなら結果も同じ）
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const deck: CardId[] = [];
  for (const id of pool) if (addReason(deck, id) === null) deck.push(id);
  return deck;
}
