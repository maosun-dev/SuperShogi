import { describe, it, expect } from 'vitest';
import { armSoundUnlock, watchResume, type EventTargetLike } from '../../src/app/unlock';

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
  const s = { calls: 0, run, unlock() { s.calls++; }, running: () => s.run };
  return s;
}
function fakeDoc(state = 'visible') {
  const fns: Array<() => void> = [];
  return { visibilityState: state, addEventListener(_t: 'visibilitychange', f: () => void) { fns.push(f); }, fire() { for (const f of fns) f(); } };
}

describe('armSoundUnlock / watchResume', () => {
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

  it('裏から戻って止まっていたら付け直す', () => {
    const t = fakeTarget(); const s = fakeSound(true);
    const d = fakeDoc('hidden');
    armSoundUnlock(s, t);
    t.fire('click'); // running なので外れる
    expect(t.count()).toBe(0);
    watchResume(s, t, d);
    s.run = false; s.calls = 0;
    d.visibilityState = 'visible';
    d.fire();
    expect(s.calls).toBe(1);
    expect(t.count()).toBe(4);
    t.fire('touchend');
    expect(s.calls).toBe(2);
  });

  it('戻った時点で再開できていれば付け直さない', () => {
    const t = fakeTarget(); const s = fakeSound(false);
    s.unlock = () => { s.calls++; s.run = true; };
    watchResume(s, t, fakeDoc());
    // 見えるようになったとき
    const d = fakeDoc(); watchResume(s, t, d); d.fire();
    expect(s.calls).toBe(1);
    expect(t.count()).toBe(0);
  });

  it('見えなくなっただけでは何もしない', () => {
    const t = fakeTarget(); const s = fakeSound(false);
    const d = fakeDoc('hidden');
    watchResume(s, t, d);
    d.fire();
    expect(s.calls).toBe(0);
    expect(t.count()).toBe(0);
  });

  it('付け直しを重ねても登録は4つのまま', () => {
    const t = fakeTarget(); const s = fakeSound(false);
    const d = fakeDoc(); watchResume(s, t, d);
    d.fire(); d.fire();
    expect(t.count()).toBe(4);
  });
});
