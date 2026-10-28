// エンディングの時計：曲の位置に合わせ、取れないときは自分の時計で進む（戻らない）
import { describe, expect, it } from 'vitest';
import { createEndingClock } from '../../src/app/ending/clock';

function src(start: number) {
  let ms = start;
  let music: number | null = null;
  return {
    musicTime: () => music,
    now: () => ms,
    setMusic(v: number | null) { music = v; },
    tick(d: number) { ms += d; },
  };
}

describe('createEndingClock', () => {
  it('曲の位置が取れれば、それを使う', () => {
    const s = src(1000);
    const c = createEndingClock(s);
    s.setMusic(12.5);
    expect(c.t()).toBe(12.5);
  });
  it('曲の位置が取れなければ、自分の時計で進む', () => {
    const s = src(1000);
    const c = createEndingClock(s);
    expect(c.t()).toBe(0);
    s.tick(3000);
    expect(c.t()).toBe(3);
  });
  it('曲の位置が途中で取れなくなったら、最後の位置から自分の時計で続ける', () => {
    const s = src(0);
    const c = createEndingClock(s);
    s.setMusic(40);
    expect(c.t()).toBe(40);
    s.setMusic(null);
    s.tick(2000);
    expect(c.t()).toBe(42);
  });
  it('曲の位置が後ろへ戻っても、時計は戻らない', () => {
    const s = src(0);
    const c = createEndingClock(s);
    s.setMusic(40);
    c.t();
    s.setMusic(10);
    expect(c.t()).toBe(40);
  });
});
