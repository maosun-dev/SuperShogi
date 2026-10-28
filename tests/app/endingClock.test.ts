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
    for (let i = 0; i < 30; i++) { s.tick(100); c.t(); }
    expect(c.t()).toBeCloseTo(3, 5);
  });
  it('曲の位置が途中で取れなくなったら、最後の位置から自分の時計で続ける（1コマずつ）', () => {
    const s = src(0);
    const c = createEndingClock(s);
    s.setMusic(40);
    expect(c.t()).toBe(40);
    s.setMusic(null);
    for (let i = 0; i < 20; i++) { s.tick(100); c.t(); }
    expect(c.t()).toBeCloseTo(42, 5);
  });
  it('裏に回って長く止まっていても、その時間は足さない（場面が先へ飛ばない）', () => {
    const s = src(0);
    const c = createEndingClock(s);
    s.setMusic(40);
    c.t();
    s.setMusic(null);
    s.tick(60_000); // 裏にいた1分
    expect(c.t()).toBeLessThan(40.2);
  });
  it('戻って曲が前の位置から鳴り直しても、止まらずに続きから進む', () => {
    const s = src(0);
    const c = createEndingClock(s);
    s.setMusic(40);
    c.t();
    s.setMusic(null);
    s.tick(60_000);
    const back = c.t();
    s.setMusic(40);          // 曲は覚えた位置から鳴り直す
    expect(c.t()).toBeCloseTo(back, 5);
    s.setMusic(45);          // 5秒たつと
    expect(c.t()).toBeCloseTo(back + 5, 5);
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
