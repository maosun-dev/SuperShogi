import { describe, it, expect } from 'vitest';
import { armSoundUnlock, watchAppLife, type AppLife, type EventTargetLike } from '../../src/app/unlock';

const KINDS = ['pointerdown', 'touchend', 'click', 'keydown'];

function fakeTarget(): EventTargetLike & { l: Map<string, Set<() => void>>; fire(t: string): void; count(): number } {
  const l = new Map<string, Set<() => void>>();
  return {
    l,
    addEventListener(t, f) { (l.get(t) ?? l.set(t, new Set()).get(t)!).add(f); },
    removeEventListener(t, f) { l.get(t)?.delete(f); },
    fire(t) { for (const f of [...(l.get(t) ?? [])]) f(); },
    count() { let n = 0; for (const s of l.values()) n += s.size; return n; },
  };
}
function fakeSound(run = false) {
  const s = { calls: 0, slept: 0, run, unlock() { s.calls++; }, running: () => s.run, sleep() { s.slept++; } };
  return s;
}

describe('armSoundUnlock', () => {
  it('操作で解錠したら登録を外す', () => {
    const t = fakeTarget(); const s = fakeSound();
    armSoundUnlock(s, t);
    expect(t.count()).toBe(4);
    s.run = true;
    t.fire('click');
    expect(s.calls).toBe(1);
    expect(t.count()).toBe(0);
    for (const k of KINDS) expect(t.l.get(k)?.size ?? 0).toBe(0);
  });

  it('まだ running でなければ登録を残す', () => {
    const t = fakeTarget(); const s = fakeSound();
    armSoundUnlock(s, t);
    t.fire('touchend');
    expect(t.count()).toBe(4);
  });

  it('付け直しを重ねても登録は4つのまま', () => {
    const t = fakeTarget(); const s = fakeSound(false);
    const l = fakeLife(); watchAppLife(s, t, l);
    l.active(); l.active();
    expect(t.count()).toBe(4);
  });
});

// アプリ本体の「裏に回った・表に戻った」の知らせ（iPhone ではブラウザの visibilitychange が当てにならないため、2026-10-27）
function fakeLife(): AppLife & { bg(): void; active(): void } {
  const b: Array<() => void> = [], a: Array<() => void> = [];
  return {
    onBackground(f) { b.push(f); }, onActive(f) { a.push(f); },
    bg() { for (const f of b) f(); }, active() { for (const f of a) f(); },
  };
}

describe('watchAppLife', () => {
  it('裏に回ったら音を止める', () => {
    const t = fakeTarget(); const s = fakeSound(true); const l = fakeLife();
    watchAppLife(s, t, l);
    l.bg();
    expect(s.slept).toBe(1);
  });

  it('表に戻って止まっていたら再開を試し、だめなら次の操作で鳴らし直せるよう付け直す', () => {
    const t = fakeTarget(); const s = fakeSound(false); const l = fakeLife();
    watchAppLife(s, t, l);
    l.active();
    expect(s.calls).toBe(1);
    expect(t.count()).toBe(4);
    t.fire('touchend');
    expect(s.calls).toBe(2);
  });

  it('表に戻った時点で鳴らせれば何もしない（通知の幕を下ろしただけなど）', () => {
    const t = fakeTarget(); const s = fakeSound(true); const l = fakeLife();
    watchAppLife(s, t, l);
    l.active();
    expect(s.calls).toBe(0);
    expect(t.count()).toBe(0);
  });
});
