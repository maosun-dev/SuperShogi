import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/cards';
import { EQUIP_FX, MAGIC_FX, TRAP_FX } from '../../src/fx/cards';

// 札1枚につき1つ、その札だけの演出がある（設計書 2026-10-23-card-fx-design.md の7章）
describe('札の演出の表', () => {
  const ids = (kind: string) => Object.values(CARDS).filter((d) => d.kind === kind).map((d) => d.id).sort();
  it('術札はすべて MAGIC_FX にある', () => {
    expect(Object.keys(MAGIC_FX).sort()).toEqual(ids('magic'));
  });
  it('忍札はすべて TRAP_FX にある', () => {
    expect(Object.keys(TRAP_FX).sort()).toEqual(ids('trap'));
  });
  it('纏札はすべて EQUIP_FX にある', () => {
    expect(Object.keys(EQUIP_FX).sort()).toEqual(ids('equip'));
  });
  it('表の札はどれも見せ場（main）を持つ', () => {
    for (const fx of [...Object.values(MAGIC_FX), ...Object.values(TRAP_FX), ...Object.values(EQUIP_FX)]) {
      expect(typeof fx?.main).toBe('function');
    }
  });
});
