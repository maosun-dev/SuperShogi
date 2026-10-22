// 舞台の切り替え：<html> の印を付ける
import { describe, expect, it } from 'vitest';
import { STAGES, STAGE_LABEL, applyStage, changeStage, effectiveMotion, onStageChange } from '../../src/app/stageTheme';

function fakeEl() {
  const data: Record<string, string> = {};
  return { dataset: data };
}

describe('舞台', () => {
  it('3つの舞台と名前', () => {
    expect(STAGES).toEqual(['kabuki', 'ukiyoe', 'byobu']);
    expect(STAGE_LABEL).toEqual({ kabuki: '歌舞伎の舞台', ukiyoe: '浮世絵の空', byobu: '金屏風の座敷' });
  });
  it('背景の動き：auto は端末の「動きを減らす」で決まる', () => {
    expect(effectiveMotion('auto', false)).toBe('full');
    expect(effectiveMotion('auto', true)).toBe('low');
    expect(effectiveMotion('full', true)).toBe('full');
    expect(effectiveMotion('low', false)).toBe('low');
  });
  it('applyStage は data-stage と data-motion を付ける', () => {
    const el = fakeEl();
    applyStage(el, { stage: 'ukiyoe', motion: 'auto' }, true);
    expect(el.dataset).toEqual({ stage: 'ukiyoe', motion: 'low' });
  });
});

describe('舞台の切り替えの知らせ', () => {
  it('changeStage は印を付け直し、登録した相手に知らせる。外せば知らせない', () => {
    const el = fakeEl();
    const got: string[] = [];
    const off = onStageChange((s, m) => got.push(`${s}:${m}`));
    changeStage(el, { stage: 'byobu', motion: 'low' }, false);
    expect(el.dataset).toEqual({ stage: 'byobu', motion: 'low' });
    off();
    changeStage(el, { stage: 'kabuki', motion: 'full' }, false);
    expect(got).toEqual(['byobu:low']);
  });
});
