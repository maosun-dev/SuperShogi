// カード定義の型。ルール本体はこの形を呼ぶだけで、カードの中身を知らない
import type { CardId, GameEvent, GameState, HandKind, Side, Square } from '../rules/types';

export type CardKind = 'magic' | 'trap' | 'equip';

export interface CardContext {
  state: GameState;            // 書き換えてよい複製
  side: Side;                  // カードを使った側
  emit(e: GameEvent): void;
  destroy(sq: Square, cause: CardId): void;   // 駒を消す（持ち駒にならない）
  relocate(from: Square, to: Square): void;   // 駒を空きマスへ移す。移った先に相手の落とし穴があれば発動させる
  swap(a: Square, b: Square): void;           // 2つの駒を入れ替える。入った先の落とし穴も調べる
}

export interface CardDef {
  id: CardId;
  name: string;
  kind: CardKind;
  cost: number;
  text: string;
  fx: string;                                         // 演出の名前（計画3で使う）
  prompt?: string;                                    // 対象を選ぶときに案内の帯へ出す文（対象を取るカードだけ）
  targetSets(s: GameState, side: Side): Square[][];   // 使える対象の組。対象なしは [[]]。空配列なら使えない
  choices?(s: GameState, side: Side): HandKind[];     // 対象のほかに選ぶ駒の種類（呼び戻し）
  resolve?(ctx: CardContext, targets: Square[], pick?: HandKind): void;   // 魔法・装備の効果
  trap?: { placement: 'square' | 'slot'; trigger: 'enter' | 'magic' | 'promote' };
  equip?: { knight?: true; armor?: true; magicShield?: true; doubleMove?: true };
}
