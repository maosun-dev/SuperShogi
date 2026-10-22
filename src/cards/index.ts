// 全カードの一覧と、持ち込みの検証
import type { CardId } from '../rules/types';
import type { CardDef } from './types';
import { MAGIC_CARDS } from './magic';
import { EQUIP_CARDS } from './equip';
import { TRAP_CARDS } from './trap';

export { isShielded } from './shield';

export const CARDS = Object.fromEntries(
  [...MAGIC_CARDS, ...TRAP_CARDS, ...EQUIP_CARDS].map(d => [d.id, d]),
) as Record<CardId, CardDef>;

export const COST_LIMIT = 10;
export const MAX_COPIES = 1;

// 問題なしなら null、だめならその理由
export function validateDeck(ids: CardId[]): string | null {
  if (ids.some(id => !CARDS[id])) return 'ない札が入っています';
  const total = ids.reduce((sum, id) => sum + CARDS[id].cost, 0);
  if (total > COST_LIMIT) return 'コストが10を超えています';
  const counts = new Map<CardId, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  if ([...counts.values()].some(n => n > MAX_COPIES)) return '同じ札は1枚までです';
  return null;
}

// 保存してあった持ち込みを今の決まりに合わせる：知らない札・2枚目以降・前から足してコスト10を超える札を外す
export function sanitizeDeck(ids: string[]): CardId[] {
  const out: CardId[] = [];
  let total = 0;
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(CARDS, id)) continue;
    const c = id as CardId;
    if (out.includes(c) || total + CARDS[c].cost > COST_LIMIT) continue;
    out.push(c);
    total += CARDS[c].cost;
  }
  return out;
}
