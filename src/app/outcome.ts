// 結果・戦績・コストの目盛りの言葉と計算（DOM なし。テストあり）
import type { CardId, Result } from '../rules/types';
import type { CardKind } from '../cards/types';
import type { Level } from '../ai/levels';
import type { Tally } from './storage';
import { CARDS, COST_LIMIT } from '../cards';

export type Outcome = 'win' | 'loss' | 'draw';

// 強さの名前は CPU の強さと同じ所（ai/levels.ts）に置き、ここからも使えるようにする
export { LEVEL_NAME } from '../ai/levels';

/** 人間（先手）から見た勝ち負け */
export function outcomeOf(r: Result): Outcome {
  if (r.winner === null) return 'draw';
  return r.winner === 'sente' ? 'win' : 'loss';
}

/** 結果の筆文字・理由・落款の字（落款は仮。見てから直す） */
export function resultWords(r: Result): { seal: '勝' | '負' | '引分'; reason: string; stamp: '天晴' | '無念' | '互角' } {
  if (r.winner === 'sente') return { seal: '勝', reason: r.reason === 'resign' ? '相手が投了しました' : '王を取りました', stamp: '天晴' };
  if (r.winner === 'gote') return { seal: '負', reason: r.reason === 'resign' ? '投了しました' : '王を取られました', stamp: '無念' };
  return { seal: '引分', reason: r.reason === 'repetition' ? '同じ局面が4回出ました' : '300手を超えました', stamp: '互角' };
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
