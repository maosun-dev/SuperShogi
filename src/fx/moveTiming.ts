// ふだんの1手（動かす・取る・成る・打つ）の長さ。DOM も Three.js も使わない純粋な計算
import type { FxTiming } from './plan';

export interface MoveTimings {
  travel: number;   // 持ち上げ→弧→着く
  settle: number;   // 着いて少し沈んで戻る
  fly: number;      // 取られた駒がはじかれて駒台へ飛ぶ
  flip: number;     // 成りの裏返し
  hang: number;     // 打つ駒が上で止まる
  fall: number;     // 打つ駒が落ちる
  foeGlow: number;  // 相手の駒が動く前に光る
  calm: boolean;    // 動きを減らす（揺れ・飛ぶ・裏返しをやめ、まっすぐ動かす）
}

// 「長め」のときの長さ（ミリ秒）。「短め」は scale で半分になる
const LONG = { travel: 190, settle: 60, fly: 300, flip: 350, hang: 120, fall: 180, foeGlow: 120 };
const CALM_TRAVEL = 160; // 動きを減らすときの、まっすぐ動く・落ちる長さ
const CALM_FADE = 200;   // 動きを減らすときの、取られた駒が薄くなって消える長さ

export function moveTimings(t: FxTiming): MoveTimings {
  const k = (ms: number): number => ms * t.scale;
  if (!t.camera) {
    return {
      travel: k(CALM_TRAVEL), settle: 0, fly: k(CALM_FADE), flip: 0, hang: 0, fall: k(CALM_TRAVEL),
      foeGlow: k(LONG.foeGlow), calm: true,
    };
  }
  return {
    travel: k(LONG.travel), settle: k(LONG.settle), fly: k(LONG.fly), flip: k(LONG.flip),
    hang: k(LONG.hang), fall: k(LONG.fall), foeGlow: k(LONG.foeGlow), calm: false,
  };
}
