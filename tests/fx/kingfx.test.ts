// 王を取る・取られる演出の案（仮の4案）：くじ・設定の読み戻し・どの案にも流れがあること
import { describe, expect, it } from 'vitest';
import { KING_FX, KING_FX_LABEL, drawKingFx, isKingFx } from '../../src/fx/kingfx/kinds';
import { loadSettings, DEFAULT_SETTINGS } from '../../src/app/storage';

function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe('drawKingFx（1局ぶんの案の決め方）', () => {
  it('決めた案はそのまま', () => {
    expect(drawKingFx('iai', 0.99)).toBe('iai');
  });
  it('くじは乱数で4案のどれか（端も外れない）', () => {
    expect(drawKingFx('random', 0)).toBe('tataki');
    expect(drawKingFx('random', 0.26)).toBe('iai');
    expect(drawKingFx('random', 0.51)).toBe('hanabi');
    expect(drawKingFx('random', 0.999)).toBe('yatai');
    expect(drawKingFx('random', 1)).toBe('yatai');
  });
  it('4案とも名前がある', () => {
    expect(KING_FX).toHaveLength(4);
    for (const k of KING_FX) expect(KING_FX_LABEL[k]).toBeTruthy();
    expect(isKingFx('iai')).toBe(true);
    expect(isKingFx('random')).toBe(false);
    expect(isKingFx('toString')).toBe(false);
  });
});

describe('設定の王を取る演出', () => {
  it('最初はくじ。前の版の保存や変な値もくじ', () => {
    expect(DEFAULT_SETTINGS.kingFx).toBe('random');
    expect(loadSettings(store({ 'superShogi.settings': '{"fx":"short"}' })).kingFx).toBe('random');
    expect(loadSettings(store({ 'superShogi.settings': '{"kingFx":"bomb"}' })).kingFx).toBe('random');
    expect(loadSettings(store({ 'superShogi.settings': '{"kingFx":"hanabi"}' })).kingFx).toBe('hanabi');
    expect(loadSettings(store({ 'superShogi.settings': '{"kingFx":"ryu"}' })).kingFx).toBe('random'); // やめた墨の龍
  });
});
