// 音の記録（裏から戻ると音が消える件を実機で調べるため、2026-10-27）
import { describe, expect, it } from 'vitest';
import { clearSoundLog, soundLog, soundLogText } from '../../src/fx/soundLog';

describe('soundLog', () => {
  it('書いた順に並び、時刻が付く', () => {
    clearSoundLog();
    soundLog('作る running');
    soundLog('アプリが裏に');
    const lines = soundLogText().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d\d:\d\d:\d\d 作る running$/);
    expect(lines[1]).toMatch(/アプリが裏に$/);
  });

  it('同じ文が続いたら1行にまとめて回数を付ける', () => {
    clearSoundLog();
    soundLog('鳴らせない suspended');
    soundLog('鳴らせない suspended');
    soundLog('鳴らせない suspended');
    expect(soundLogText().split('\n')).toHaveLength(1);
    expect(soundLogText()).toMatch(/鳴らせない suspended ×3$/);
  });

  it('古いものから消え、80行を超えない', () => {
    clearSoundLog();
    for (let i = 0; i < 100; i++) soundLog(`行${i}`);
    const lines = soundLogText().split('\n');
    expect(lines).toHaveLength(80);
    expect(lines[0]).toMatch(/行20$/);
  });
});
