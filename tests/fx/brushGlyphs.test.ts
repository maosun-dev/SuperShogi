import { describe, expect, it } from 'vitest';
import { BRUSH_EM, BRUSH_GLYPHS, STROKE_COUNT, type WrittenChar } from '../../src/fx/brushGlyphs';

const CHARS: WrittenChar[] = ['王', '手', '勝', '負', '引', '分', '投', '了'];
const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('筆文字の字の形と筆の通り道', () => {
  it('8字そろっていて、画の数が書き順どおり（開戦は書き終わりの姿だけ）', () => {
    expect(Object.keys(BRUSH_GLYPHS).sort()).toEqual([...CHARS, '開', '戦'].sort());
    expect(BRUSH_GLYPHS['開'].strokes).toEqual([]);
    expect(BRUSH_GLYPHS['戦'].strokes).toEqual([]);
    expect(BRUSH_GLYPHS['開'].d).toMatch(/^M[MLQCZ0-9.\s-]+$/);
    expect(STROKE_COUNT).toEqual({ 王: 4, 手: 4, 勝: 12, 負: 9, 引: 4, 分: 4, 投: 7, 了: 2 });
    for (const c of CHARS) expect(BRUSH_GLYPHS[c].strokes.length).toBe(STROKE_COUNT[c]);
  });
  it('輪郭と通り道は M で始まる path で、命令と数だけ', () => {
    for (const c of CHARS) {
      const g = BRUSH_GLYPHS[c];
      for (const d of [g.d, ...g.strokes.map((s) => s.d)]) {
        expect(d).toMatch(/^M/);
        expect(d).toMatch(/^[MLQCZ0-9.\s-]+$/);
      }
    }
  });
  it('通り道の太さは 40〜200、点は 1字の枠の中', () => {
    for (const c of CHARS) {
      for (const s of BRUSH_GLYPHS[c].strokes) {
        expect(s.w).toBeGreaterThanOrEqual(40);
        expect(s.w).toBeLessThanOrEqual(200);
        for (const n of nums(s.d)) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(BRUSH_EM);
        }
      }
    }
  });
});
