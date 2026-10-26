import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { createSound, getSound, musicResponseUsable, volumeToGain } from '../../src/fx/sound';

describe('musicResponseUsable（曲のファイルの返事を使ってよいか）', () => {
  it('200 と 206（範囲を指定した返事）は使う', () => {
    expect(musicResponseUsable(200, 1000)).toBe(true);
    expect(musicResponseUsable(206, 1000)).toBe(true);
  });
  it('iPhone アプリで番号のない返事（0）でも、中身があれば使う', () => {
    expect(musicResponseUsable(0, 1000)).toBe(true);
  });
  it('中身が空・404 などは使わない', () => {
    expect(musicResponseUsable(0, 0)).toBe(false);
    expect(musicResponseUsable(404, 1000)).toBe(false);
  });
});

describe('volumeToGain', () => {
  it('0 は無音、1 は最大', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
  });
  it('つまみが上がるほど大きくなる', () => {
    expect(volumeToGain(0.3)).toBeLessThan(volumeToGain(0.6));
  });
  it('範囲外や数でない値は丸める', () => {
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(5)).toBe(1);
    expect(volumeToGain(NaN)).toBe(0);
  });
});

describe('getSound（AudioContext のない Node）', () => {
  it('unlock と play が例外を出さず、音は出せない状態のまま', () => {
    const s = getSound();
    expect(() => { s.unlock(); s.play('hyoshigi'); s.setVolume(0.5); }).not.toThrow();
    expect(s.running()).toBe(false);
  });
  it('曲の出し入れも例外を出さない', () => {
    const s = getSound();
    expect(() => { s.music('taikyoku'); s.music(null); s.sleep(); }).not.toThrow();
  });
  it('駒音の3つも例外を出さない', () => {
    const s = getSound();
    expect(() => { s.play('koma'); s.play('komaHard'); s.play('kaesu'); }).not.toThrow();
  });
});

describe('札の演出の仮の音', () => {
  it('14個とも例外を出さない', () => {
    const s = getSound();
    const names = ['ice', 'trapdoor', 'thud', 'paper', 'glass', 'slash', 'poof', 'reel', 'armor', 'chain', 'hoof', 'flame', 'tsuke', 'splash'] as const;
    expect(() => { for (const n of names) s.play(n); }).not.toThrow();
  });
});

describe('決着の仮の音', () => {
  it('筆の音と鈴も例外を出さない', () => {
    const s = getSound();
    expect(() => { s.play('fude'); s.play('suzu'); }).not.toThrow();
  });
});

describe('録った音（2026-10-24）', () => {
  it('雷鳴・落雷・勝ち負けの決め音も例外を出さない', () => {
    const s = getSound();
    expect(() => { for (const n of ['raimei', 'rakurai', 'kachi', 'make', 'tekkyu', 'inanaki', 'maku', 'levelup', 'anaThud', 'fuuin', 'cardOut'] as const) s.play(n); }).not.toThrow();
  });
  it('新しい2曲の出し入れも例外を出さない', () => {
    const s = getSound();
    expect(() => { s.music('sakura'); s.music('title'); s.music(null); }).not.toThrow();
  });
});

describe('裏へ回ってから戻ったとき（iPhone で音が戻らなかった、2026-10-26）', () => {
  // 音の仕組みのにせもの。作った数と閉じたかだけ見る
  const made: FakeCtx[] = [];
  class FakeCtx {
    state = 'running';
    sampleRate = 48000;
    currentTime = 0;
    destination = {};
    constructor() { made.push(this); }
    createGain() {
      const p = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} };
      return { gain: p, connect: (x: unknown) => x };
    }
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
    addEventListener() {}
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  afterEach(() => { vi.unstubAllGlobals(); made.length = 0; });

  it('裏へ回ったら音の仕組みを閉じ、戻って解錠したら新しく作り直す', () => {
    vi.stubGlobal('AudioContext', FakeCtx);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('読まない')));
    const s = createSound();
    s.unlock();
    expect(made).toHaveLength(1);
    expect(s.running()).toBe(true);
    s.sleep();
    expect(made[0]!.state).toBe('closed');
    expect(s.running()).toBe(false);
    s.unlock();
    expect(made).toHaveLength(2);
    expect(s.running()).toBe(true);
  });
});
