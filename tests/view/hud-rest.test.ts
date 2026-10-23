// 相手の残り札の見せ方：忍札は伏せたものを当てられないよう、札の裏（枚数だけ）で見せる
import { describe, expect, it } from 'vitest';
import { restView } from '../../src/view/hud';

describe('restView', () => {
  it('術札・纏札は表で、忍札は枚数だけ', () => {
    expect(restView(['oshikaeshi', 'otoshiana', 'tenma', 'kagami'])).toEqual({ open: ['oshikaeshi', 'tenma'], hiddenTraps: 2 });
  });
  it('忍札がなければ裏は0枚', () => {
    expect(restView(['irekae'])).toEqual({ open: ['irekae'], hiddenTraps: 0 });
  });
  it('札がなければどちらも空', () => {
    expect(restView([])).toEqual({ open: [], hiddenTraps: 0 });
  });
});
