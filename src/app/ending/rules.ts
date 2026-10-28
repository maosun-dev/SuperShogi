// 大詰のエンディングを流す・飛ばせるの決まり（three を読まない純粋な部品）
import type { Level } from '../../ai/levels';
import type { Result } from '../../rules/types';

/** どんな対局か（対局画面が渡す） */
export interface EndingWhen { level: Level; keiko: boolean; friend: boolean; auto: boolean }

/** 大見得を使う対局か：本番の傾奇者（稽古・友と対局・自動対局でない）。対局の始まりに決める */
export function oomieOn(w: EndingWhen): boolean {
  return w.level === 'kabuki' && !w.keiko && !w.friend && !w.auto;
}

/** 対局が終わったら、エンディングへ進むか：大見得の対局で、人（先手）が王を取って勝ったとき */
export function endingAfter(w: EndingWhen, result: Result): boolean {
  return oomieOn(w) && result.reason === 'king-captured' && result.winner === 'sente';
}

/** 飛ばせるか：一度最後まで見たら飛ばせる（初めては飛ばせない） */
export function canSkip(seen: boolean): boolean {
  return seen;
}
