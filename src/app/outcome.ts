// 結果・戦績・コストの目盛りの言葉と計算（DOM なし。テストあり）
import type { CardId, Result } from '../rules/types';
import type { CardKind } from '../cards/types';
import type { Level } from '../ai/levels';
import type { Tally } from './storage';
import { CARDS, COST_LIMIT } from '../cards';

export type Outcome = 'win' | 'loss' | 'draw';

export const LEVEL_NAME: Record<Level, string> = { weak: '弱い', normal: 'ふつう', strong: '強い' };

/** 人間（先手）から見た勝ち負け */
export function outcomeOf(r: Result): Outcome {
  if (r.winner === null) return 'draw';
  return r.winner === 'sente' ? 'win' : 'loss';
}

/** 結果の判の字と理由 */
export function resultWords(r: Result): { seal: '勝' | '負' | '引分'; reason: string } {
  if (r.winner === 'sente') return { seal: '勝', reason: '王を取りました' };
  if (r.winner === 'gote') return { seal: '負', reason: '王を取られました' };
  return { seal: '引分', reason: r.reason === 'repetition' ? '同じ局面が4回出ました' : '300手を超えました' };
}

/** 戦績の短い言葉（例「3勝 1敗」。引き分けがあれば「 2分」を足す） */
export function tallyText(t: Tally): string {
  const base = `${t.wins}勝 ${t.losses}敗`;
  return t.draws > 0 ? `${base} ${t.draws}分` : base;
}

/** コストの目盛り10個：前から、選んだカードの種類の色で埋める（空きは null） */
export function costMarks(deck: CardId[]): (CardKind | null)[] {
  const out: (CardKind | null)[] = [];
  for (const id of deck) for (let i = 0; i < CARDS[id].cost && out.length < COST_LIMIT; i++) out.push(CARDS[id].kind);
  while (out.length < COST_LIMIT) out.push(null);
  return out;
}
