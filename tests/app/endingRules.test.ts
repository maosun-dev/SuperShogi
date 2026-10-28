// エンディングを流す・飛ばせる・見返せるの決まりと、見たかの記録
import { describe, expect, it } from 'vitest';
import { canSkip, endingAfter, oomieOn, type EndingWhen } from '../../src/app/ending/rules';
import { loadEndingSeen, markEndingSeen, SAVE_KEYS, type KeyValueStore } from '../../src/app/storage';
import type { Result } from '../../src/rules/types';

const HONBAN: EndingWhen = { level: 'kabuki', keiko: false, friend: false, auto: false };
const WIN: Result = { winner: 'sente', reason: 'king-captured' };

function mem(init: Record<string, string> = {}): KeyValueStore {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('endingAfter（エンディングを流すか）', () => {
  it('本番の傾奇者の王を取って勝ったら流す', () => {
    expect(oomieOn(HONBAN)).toBe(true);
    expect(endingAfter(HONBAN, WIN)).toBe(true);
  });
  it('稽古・友と対局・自動対局では流さない', () => {
    for (const w of [{ ...HONBAN, keiko: true }, { ...HONBAN, friend: true }, { ...HONBAN, auto: true }]) {
      expect(oomieOn(w)).toBe(false);
      expect(endingAfter(w, WIN)).toBe(false);
    }
  });
  it('ほかの強さでは流さない', () => {
    for (const level of ['oni', 'shihan', 'strong', 'weak'] as const) expect(endingAfter({ ...HONBAN, level }, WIN)).toBe(false);
  });
  it('負け・引き分け・投了では流さない', () => {
    expect(endingAfter(HONBAN, { winner: 'gote', reason: 'king-captured' })).toBe(false);
    expect(endingAfter(HONBAN, { winner: null, reason: 'repetition' })).toBe(false);
    expect(endingAfter(HONBAN, { winner: null, reason: 'move-limit' })).toBe(false);
    expect(endingAfter(HONBAN, { winner: 'sente', reason: 'resign' })).toBe(false);
  });
});

describe('飛ばせるか・見たかの記録', () => {
  it('初めては飛ばせず、見たあとは飛ばせる', () => {
    expect(canSkip(false)).toBe(false);
    expect(canSkip(true)).toBe(true);
  });
  it('何も無ければ見ていない。記録したら見た。壊れた値は見ていない扱い', () => {
    const st = mem();
    expect(loadEndingSeen(st)).toBe(false);
    markEndingSeen(st);
    expect(loadEndingSeen(st)).toBe(true);
    expect(loadEndingSeen(mem({ 'superShogi.ending': '{' }))).toBe(false);
    expect(loadEndingSeen(mem({ 'superShogi.ending': '"yes"' }))).toBe(false);
  });
  it('アプリの消えにくい保存にも写す鍵に入っている', () => {
    expect(SAVE_KEYS).toContain('superShogi.ending');
  });
});
