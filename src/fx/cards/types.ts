// 札ごとの演出の形。どの札も「前振り（名前ドンの前）→ 見せ場 → 余韻」の3つの段を持つ。
// 名前ドン（cutIn）は共通の流れ（magic.ts・trap.ts・equip.ts）が前振りと見せ場のあいだに挟む。
// 纏札は、付けるとき（main）に加えて、付けたあとの出番（onMove・onArmor・onBreak・onSecond）を持てる
import type { GameEvent, GameState, Square } from '../../rules/types';
import type { Cue } from '../plan';
import type { FxCtx } from '../kit';

export type MagicCue = Extract<Cue, { kind: 'magic' }>;
export type TrapFireCue = Extract<Cue, { kind: 'trapFire' }>;
export type EquipCue = Extract<Cue, { kind: 'equip' }>;
export type MoveCue = Extract<Cue, { kind: 'move' }>;
export type ArmorCue = Extract<Cue, { kind: 'armor' }>;
export type BreakCue = Extract<Cue, { kind: 'equipBreak' }>;
export type SecondCue = Extract<Cue, { kind: 'second' }>;

export interface CardFx<C> {
  /** 前振り：名前ドンの前 */
  pre?(ctx: FxCtx, cue: C): Promise<void>;
  /** 見せ場：札の効果 */
  main(ctx: FxCtx, cue: C): Promise<void>;
  /** 余韻：見せ場のあと、照明やカメラを戻す前 */
  after?(ctx: FxCtx, cue: C): Promise<void>;
  /** 後始末：途中で止まっても（鏡で無効・打ち切り・失敗）必ず呼ぶ。前振りで置いた物を片付ける */
  cleanup?(ctx: FxCtx, cue: C): void;
  /** 名前ドンを見せる長さ（ms、長めの値）。なければ共通の長さ */
  nameMs?: number;
}

export interface EquipFx extends CardFx<EquipCue> {
  /** 付けた駒の、札の力を使う手（退き陣で下がる・天馬で跳ぶ・槍で飛び越える）。ふだんの1手の前に流す */
  onMove?(ctx: FxCtx, cue: MoveCue): Promise<void>;
  /** 鋼の鎧が守った */
  onArmor?(ctx: FxCtx, cue: ArmorCue): Promise<void>;
  /** 纏札が外れた（槍を使い切った・枷の手番が尽きた） */
  onBreak?(ctx: FxCtx, cue: BreakCue): Promise<void>;
  /** 韋駄天の2回目の移動 */
  onSecond?(ctx: FxCtx, cue: SecondCue): Promise<void>;
}

/** 効果の出来事のうち、最初の type のもの */
export function effect<T extends GameEvent['type']>(
  cue: { effects: GameEvent[] }, type: T,
): Extract<GameEvent, { type: T }> | undefined {
  return cue.effects.find((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** 局面の中で、その駒がいるマス */
export function squareOf(s: GameState, pieceId: number): Square | null {
  const i = s.board.findIndex((p) => p?.id === pieceId);
  return i < 0 ? null : { c: i % 9, r: Math.floor(i / 9) };
}

/** 前の局面で、そのマスにいた駒の id */
export function pieceIdAt(ctx: FxCtx, sq: Square): number | undefined {
  return ctx.before.board[sq.r * 9 + sq.c]?.id;
}
