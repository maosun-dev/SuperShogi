// 相手の残り札の見せ方：術札・纏札は残っているものを表で。
// 忍札は札見せで中身を見せているので、持ち込んだ全部の名前を出す（どれを伏せたかは分からない。発動したものだけ印）
import { describe, expect, it } from 'vitest';
import { restView } from '../../src/view/hud';
import type { CardId } from '../../src/rules/types';

const c = (cardId: CardId, used = false) => ({ cardId, used });

describe('restView', () => {
  it('術札・纏札は残っているものだけ表で、忍札は持ち込んだ全部', () => {
    expect(restView([c('oshikaeshi'), c('otoshiana'), c('tenma', true), c('kagami')])).toEqual({
      open: ['oshikaeshi'],
      traps: [{ id: 'otoshiana', fired: false }, { id: 'kagami', fired: false }],
    });
  });
  it('発動した忍札には印を付け、一覧からは消さない', () => {
    expect(restView([c('aiuchi', true), c('itetsuku')]).traps).toEqual([
      { id: 'aiuchi', fired: true }, { id: 'itetsuku', fired: false },
    ]);
  });
  it('札がなければどちらも空', () => {
    expect(restView([])).toEqual({ open: [], traps: [] });
  });
});
