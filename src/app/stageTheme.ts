// 舞台（背景と画面の雰囲気）の切り替え。<html> に data-stage と data-motion を付け、CSS と背景の部品がそれを見る
import type { Motion, Settings, StageId } from './storage';

export const STAGES: StageId[] = ['kabuki', 'ukiyoe', 'byobu'];
export const STAGE_LABEL: Record<StageId, string> = {
  kabuki: '歌舞伎の舞台',
  ukiyoe: '浮世絵の空',
  byobu: '金屏風の座敷',
};

/** auto を、端末の「動きを減らす」設定で full / low に決める */
export function effectiveMotion(m: Motion, reduced: boolean): 'full' | 'low' {
  if (m === 'auto') return reduced ? 'low' : 'full';
  return m;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 舞台の印を付ける。el はふつう document.documentElement */
export function applyStage(el: { dataset: Record<string, string | undefined> }, s: Pick<Settings, 'stage' | 'motion'>, reduced = prefersReducedMotion()): void {
  el.dataset.stage = s.stage;
  el.dataset.motion = effectiveMotion(s.motion, reduced);
}
