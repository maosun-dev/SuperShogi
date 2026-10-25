import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { musicFor, pickMatchTrack } from '../../src/app/music';
import { SAMPLES, TRACKS } from '../../src/fx/sound';

describe('musicFor（画面ごとの曲）', () => {
  it('対局はその局に決めた曲（決めていなければ対局BGM1）', () => {
    expect(musicFor('match', 'sakura')).toBe('sakura');
    expect(musicFor('match')).toBe('taikyoku');
  });
  it('結果画面は無音（決着の決め音を聞かせる）', () => {
    expect(musicFor('result')).toBeNull();
  });
  it('タイトル〜対局の前の画面はタイトルの曲', () => {
    for (const n of ['title', 'level', 'deck', 'reveal', 'zukan', 'settings'] as const) {
      expect(musicFor(n)).toBe('title');
    }
  });
});

describe('pickMatchTrack（対局の曲の決め方）', () => {
  it('決めた曲はそのまま', () => {
    expect(pickMatchTrack('taikyoku', 0.9)).toBe('taikyoku');
    expect(pickMatchTrack('sakura', 0.1)).toBe('sakura');
  });
  it('おまかせは乱数で3曲のどれか', () => {
    expect(pickMatchTrack('random', 0)).toBe('taikyoku');
    expect(pickMatchTrack('random', 0.34)).toBe('taikyoku2');
    expect(pickMatchTrack('random', 0.67)).toBe('sakura');
    expect(pickMatchTrack('random', 0.999)).toBe('sakura');
  });
  it('対局BGM2 も選べる', () => {
    expect(pickMatchTrack('taikyoku2', 0.1)).toBe('taikyoku2');
  });
});

describe('曲のループ位置', () => {
  it('対局の曲は約36.9秒（88拍）', () => {
    const t = TRACKS.taikyoku;
    expect(t.loopEnd - t.loopStart).toBeCloseTo(36.865, 2);
  });
  it('サクラドリフトは102.4秒（150BPM の256拍）', () => {
    const t = TRACKS.sakura;
    expect(t.loopEnd - t.loopStart).toBeCloseTo(102.4, 2);
  });
  it('対局BGM2 は約152拍（143BPM の38小節。打ちの揺れで格子より約40ms 短い）', () => {
    const t = TRACKS.taikyoku2;
    expect(Math.abs(t.loopEnd - t.loopStart - 152 * 60 / 143)).toBeLessThan(0.06);
  });
  it('タイトルの曲は120拍（136BPM の30小節）', () => {
    const t = TRACKS.title;
    expect(t.loopEnd - t.loopStart).toBeCloseTo(120 * 60 / 136, 3);
  });
  it('曲と録った効果音のファイルが public にある', () => {
    const paths = [...Object.values(TRACKS).map((t) => t.path), ...Object.values(SAMPLES).flatMap((s) => s.files)];
    for (const p of paths) expect(existsSync(`public/${p}`), p).toBe(true);
  });
});
