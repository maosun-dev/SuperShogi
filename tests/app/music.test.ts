import { describe, expect, it } from 'vitest';
import { musicFor } from '../../src/app/music';
import { TRACKS } from '../../src/fx/sound';

describe('musicFor（画面ごとの曲）', () => {
  it('対局の画面だけ対局の曲', () => {
    expect(musicFor('match')).toBe('taikyoku');
  });
  it('ほかの画面は曲なし（いまは対局の曲だけ）', () => {
    for (const n of ['title', 'level', 'deck', 'reveal', 'result', 'zukan', 'settings'] as const) {
      expect(musicFor(n)).toBeNull();
    }
  });
});

describe('対局の曲のループ位置', () => {
  it('ループの頭は終わりより前で、長さは約36.9秒（88拍）', () => {
    const t = TRACKS.taikyoku;
    expect(t.loopEnd - t.loopStart).toBeCloseTo(36.865, 2);
  });
});
