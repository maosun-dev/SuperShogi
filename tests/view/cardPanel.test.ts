// 札の説明の場所（広い画面の右上）：相手が使った札を出来事から拾う・札の見出しの作り
import { describe, expect, it } from 'vitest';
import { cardInfo, foeCardFrom } from '../../src/view/cardPanel';
import { CARDS } from '../../src/cards';
import type { GameEvent } from '../../src/rules/types';

const used = (side: 'sente' | 'gote', cardId: 'rakurai' | 'oshikaeshi'): GameEvent => ({ type: 'cardUsed', side, cardId, targets: [] });
const fired = (owner: 'sente' | 'gote', cardId: 'otoshiana' | 'kagami'): GameEvent => ({ type: 'trapTriggered', owner, uid: 1, cardId, at: null });

describe('foeCardFrom', () => {
  it('相手が使った札', () => {
    expect(foeCardFrom([used('gote', 'rakurai')], 'sente')).toBe('rakurai');
  });
  it('自分が使った札は出さない', () => {
    expect(foeCardFrom([used('sente', 'rakurai')], 'sente')).toBeNull();
  });
  it('伏せただけの忍札は出さない（中身は秘密）', () => {
    expect(foeCardFrom([{ type: 'trapSet', side: 'gote', uid: 2, cardId: 'otoshiana', at: null }], 'sente')).toBeNull();
  });
  it('相手の罠が発動したら出す。自分の罠は出さない', () => {
    expect(foeCardFrom([fired('gote', 'otoshiana')], 'sente')).toBe('otoshiana');
    expect(foeCardFrom([fired('sente', 'otoshiana')], 'sente')).toBeNull();
  });
  it('いくつかあれば最後に表になった札', () => {
    expect(foeCardFrom([used('gote', 'rakurai'), fired('gote', 'kagami')], 'sente')).toBe('kagami');
  });
  it('出来事が無ければ null', () => {
    expect(foeCardFrom([], 'sente')).toBeNull();
  });
});

describe('cardInfo', () => {
  it('名前・種類とコスト・説明・色', () => {
    expect(cardInfo('rakurai')).toEqual({
      name: CARDS.rakurai.name,
      meta: `術札・コスト${CARDS.rakurai.cost}`,
      text: CARDS.rakurai.text,
      color: 'mahou',
    });
  });
});
