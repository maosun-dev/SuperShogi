// エンディングの台本：場面の時刻・回り舞台の札の順・役名・クレジット
import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/cards';
import {
  CAST_ORDER, ENDING_LEN, ENDING_TRACK, MUSIC_STOP_AT, ROLES, SCENES, STAFF, castAt, sceneAt,
} from '../../src/app/ending/script';

describe('sceneAt（何秒にどの場面か）', () => {
  it('区切りの手前と境目', () => {
    expect(sceneAt(-1)).toBe('open');
    expect(sceneAt(0)).toBe('open');
    expect(sceneAt(4.99)).toBe('open');
    expect(sceneAt(5)).toBe('turn');
    expect(sceneAt(86.9)).toBe('turn');
    expect(sceneAt(87)).toBe('bloom');
    expect(sceneAt(95)).toBe('kojo');
    expect(sceneAt(105)).toBe('ooiri');
    expect(sceneAt(109.9)).toBe('ooiri');
    expect(sceneAt(110)).toBe('done');
    expect(sceneAt(500)).toBe('done');
  });
  it('場面の時刻は増えていき、最後は曲の終わり', () => {
    for (let i = 1; i < SCENES.length; i++) expect(SCENES[i].at).toBeGreaterThan(SCENES[i - 1].at);
    expect(SCENES[SCENES.length - 1]).toEqual({ scene: 'done', at: ENDING_LEN });
    expect(ENDING_LEN).toBe(110);
    expect(MUSIC_STOP_AT).toBe(105);
    expect(ENDING_TRACK).toBe('sakura');
  });
});

describe('回り舞台の札', () => {
  it('18枚が重なりなく並ぶ', () => {
    expect(CAST_ORDER).toHaveLength(18);
    expect(new Set(CAST_ORDER).size).toBe(18);
    expect([...CAST_ORDER].sort()).toEqual(Object.keys(CARDS).sort());
  });
  it('castAt：回り舞台の間だけ、正面の札を返す', () => {
    expect(castAt(4)).toBeNull();
    expect(castAt(5)).toBe(CAST_ORDER[0]);
    expect(castAt(86.99)).toBe(CAST_ORDER[17]);
    expect(castAt(87)).toBeNull();
    // 18等分の真ん中あたり
    expect(castAt(5 + (82 / 18) * 9.5)).toBe(CAST_ORDER[9]);
  });
});

describe('役名とクレジット', () => {
  it('18枚すべてに「〜の役」', () => {
    expect(Object.keys(ROLES).sort()).toEqual(Object.keys(CARDS).sort());
    for (const r of Object.values(ROLES)) expect(r).toMatch(/の役$/);
    expect(ROLES.rakurai).toBe('雷神の役');
    expect(ROLES.hikijin).toBe('旗本の役');
    expect(ROLES.migawari).toBe('影武者の役');
  });
  it('作と御礼。名前はローマ字だけ（漢字を出さない）', () => {
    expect(STAFF).toEqual([{ role: '作', name: 'maosun-dev' }, { role: '御礼', name: 'DAIKI YAMADA' }]);
    for (const s of STAFF) expect(s.name).not.toMatch(/[一-龯]/);
  });
});
