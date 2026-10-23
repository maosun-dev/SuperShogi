import { describe, expect, it } from 'vitest';
import { strokeSchedule } from '../../src/fx/brush';

describe('一画ずつ書く間合い strokeSchedule', () => {
  it('1画の長さは線の長さに比例し、120〜260ms に収まる', () => {
    const s = strokeSchedule([0, 1000, 500], 1);
    expect(s.map((x) => x.ms)).toEqual([120, 260, 175]);
  });
  it('次の画は、前の画の終わりから 60ms あけて始まる', () => {
    const s = strokeSchedule([0, 1000, 500], 1);
    expect(s.map((x) => x.at)).toEqual([0, 180, 500]);
  });
  it('scale を掛ける（短めなら半分）', () => {
    const s = strokeSchedule([0, 1000, 500], 0.5);
    expect(s).toEqual([{ at: 0, ms: 60 }, { at: 90, ms: 130 }, { at: 250, ms: 87.5 }]);
  });
  it('画が無ければ空', () => {
    expect(strokeSchedule([], 1)).toEqual([]);
  });
});
