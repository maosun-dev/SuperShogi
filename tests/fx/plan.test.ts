// 演出の段取り（出来事の記録 → Cue の並び）のテスト。出来事は本物の applyAction で作る
import { describe, expect, it } from 'vitest';
import { planFx, fxTiming, type Cue } from '../../src/fx/plan';
import { applyAction } from '../../src/rules/game';
import { filterEventsFor } from '../../src/rules/view';
import type { Action, GameEvent, GameState, Square } from '../../src/rules/types';
import { emptyState, put, giveCard, setTrap } from '../helpers';

const sq = (c: number, r: number): Square => ({ c, r });

// 行動を適用し、先手から見える出来事を段取りにする
function cuesOf(s: GameState, a: Action): Cue[] {
  const { events } = applyAction(s, a);
  return planFx(filterEventsFor(events, 'sente'), s.turn);
}

// 王を両側に置いた空の局面
function base(turn: 'sente' | 'gote' = 'sente'): GameState {
  const s = emptyState(turn);
  put(s, sq(8, 8), 'OU', 'sente');
  put(s, sq(0, 0), 'OU', 'gote');
  return s;
}

describe('planFx', () => {
  it('ふつうの移動と駒取りは move 1つ', () => {
    const s = base();
    const fu = put(s, sq(4, 6), 'FU', 'sente');
    const foe = put(s, sq(4, 5), 'FU', 'gote');
    const cues = cuesOf(s, { type: 'move', from: sq(4, 6), to: sq(4, 5), promote: false });
    expect(cues).toEqual([{
      kind: 'move', side: 'sente', pieceId: fu.id, from: sq(4, 6), to: sq(4, 5), promoted: false,
      captured: { pieceId: foe.id, at: sq(4, 5) },
    }]);
  });

  it('駒を打つと drop 1つ', () => {
    const s = base();
    s.players.sente.hand.FU = 1;
    const cues = cuesOf(s, { type: 'drop', kind: 'FU', to: sq(4, 4) });
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'drop', side: 'sente', piece: 'FU', to: sq(4, 4) });
  });

  it('落雷は magic 1つで、破壊が effects に入る', () => {
    const s = base();
    const uid = giveCard(s, 'sente', 'rakurai');
    const foe = put(s, sq(2, 2), 'FU', 'gote');
    const cues = cuesOf(s, { type: 'card', uid, targets: [sq(2, 2)] });
    expect(cues).toHaveLength(1);
    const m = cues[0] as Extract<Cue, { kind: 'magic' }>;
    expect(m).toMatchObject({ kind: 'magic', side: 'sente', cardId: 'rakurai', targets: [sq(2, 2)], negated: false });
    expect(m.effects).toEqual([{ type: 'destroyed', pieceId: foe.id, at: sq(2, 2), cause: 'rakurai' }]);
  });

  it('格落とし・昇竜：magic の effects に demoted・promotedInPlace が入る', () => {
    const s = base();
    const u1 = giveCard(s, 'sente', 'kakuotoshi');
    put(s, sq(3, 3), 'GI', 'gote', { promoted: true });
    const c1 = cuesOf(s, { type: 'card', uid: u1, targets: [sq(3, 3)] });
    expect((c1[0] as Extract<Cue, { kind: 'magic' }>).effects.map(e => e.type)).toEqual(['demoted']);
    const s2 = base();
    const u2 = giveCard(s2, 'sente', 'shoryu');
    put(s2, sq(4, 6), 'FU', 'sente');
    const c2 = cuesOf(s2, { type: 'card', uid: u2, targets: [sq(4, 6)] });
    expect((c2[0] as Extract<Cue, { kind: 'magic' }>).effects.map(e => e.type)).toEqual(['promotedInPlace']);
  });

  it('凍てつく床・相討ち・身代わり：trapFire の effects に効果が入る', () => {
    const s = base();
    setTrap(s, 'gote', 'itetsuku', sq(4, 5));
    put(s, sq(4, 6), 'FU', 'sente');
    const c1 = cuesOf(s, { type: 'move', from: sq(4, 6), to: sq(4, 5), promote: false });
    expect(c1.map(c => c.kind)).toEqual(['move', 'trapFire']);
    expect((c1[1] as Extract<Cue, { kind: 'trapFire' }>).effects.map(e => e.type)).toEqual(['frozen']);

    const s2 = base();
    setTrap(s2, 'gote', 'aiuchi');
    put(s2, sq(4, 6), 'FU', 'sente');
    put(s2, sq(4, 5), 'FU', 'gote');
    const c2 = cuesOf(s2, { type: 'move', from: sq(4, 6), to: sq(4, 5), promote: false });
    expect(c2.map(c => c.kind)).toEqual(['move', 'trapFire']);
    expect((c2[1] as Extract<Cue, { kind: 'trapFire' }>).effects.map(e => e.type)).toEqual(['destroyed']);

    const s3 = emptyState();
    put(s3, sq(8, 8), 'OU', 'sente');
    put(s3, sq(4, 1), 'OU', 'gote');
    put(s3, sq(3, 1), 'FU', 'gote');
    setTrap(s3, 'gote', 'migawari');
    put(s3, sq(4, 6), 'HI', 'sente');
    const c3 = cuesOf(s3, { type: 'move', from: sq(4, 6), to: sq(4, 1), promote: false });
    expect(c3.map(c => c.kind)).toEqual(['trapFire', 'check']); // 飛車は残るので王手のまま
    expect((c3[0] as Extract<Cue, { kind: 'trapFire' }>).effects.map(e => e.type)).toEqual(['destroyed', 'kingGuarded']);
  });

  it('押し返した先の落とし穴：magic のあとに trapFire', () => {
    const s = base();
    const uid = giveCard(s, 'sente', 'oshikaeshi');
    put(s, sq(3, 3), 'FU', 'gote');
    setTrap(s, 'sente', 'otoshiana', sq(3, 2));
    const cues = cuesOf(s, { type: 'card', uid, targets: [sq(3, 3)] });
    expect(cues.map(c => c.kind)).toEqual(['magic', 'trapFire']);
    const m = cues[0] as Extract<Cue, { kind: 'magic' }>;
    expect(m.effects.map(e => e.type)).toEqual(['pushed']);
    const t = cues[1] as Extract<Cue, { kind: 'trapFire' }>;
    expect(t).toMatchObject({ owner: 'sente', cardId: 'otoshiana', at: sq(3, 2) });
    expect(t.effects.map(e => e.type)).toEqual(['destroyed']);
  });

  it('鏡の結界：magic が negated になり、そのあとに kagami の trapFire', () => {
    const s = base();
    const uid = giveCard(s, 'sente', 'rakurai');
    put(s, sq(2, 2), 'FU', 'gote');
    setTrap(s, 'gote', 'kagami');
    const cues = cuesOf(s, { type: 'card', uid, targets: [sq(2, 2)] });
    expect(cues.map(c => c.kind)).toEqual(['magic', 'trapFire']);
    expect((cues[0] as Extract<Cue, { kind: 'magic' }>).negated).toBe(true);
    const t = cues[1] as Extract<Cue, { kind: 'trapFire' }>;
    expect(t.cardId).toBe('kagami');
    expect(t.effects.map(e => e.type)).toEqual(['magicNegated']);
  });

  it('成り封じ：trapFire（promotionBlocked 入り）のあとに move（promoted:false）', () => {
    const s = base();
    put(s, sq(4, 3), 'FU', 'sente');
    setTrap(s, 'gote', 'narifuuji');
    const cues = cuesOf(s, { type: 'move', from: sq(4, 3), to: sq(4, 2), promote: true });
    expect(cues.map(c => c.kind)).toEqual(['trapFire', 'move']);
    expect((cues[0] as Extract<Cue, { kind: 'trapFire' }>).effects.map(e => e.type)).toEqual(['promotionBlocked']);
    expect(cues[1]).toMatchObject({ kind: 'move', promoted: false });
  });

  it('CPU が伏せた罠は中身なしの trapSet', () => {
    const s = base('gote');
    const uid = giveCard(s, 'gote', 'kagami');
    const cues = cuesOf(s, { type: 'card', uid, targets: [] });
    expect(cues).toEqual([{ kind: 'trapSet', side: 'gote', cardId: null, at: null }]);
  });

  it('装備は cardUsed と equipped で equip 1つ', () => {
    const s = base();
    const uid = giveCard(s, 'sente', 'tenma');
    const fu = put(s, sq(4, 6), 'FU', 'sente');
    const cues = cuesOf(s, { type: 'card', uid, targets: [sq(4, 6)] });
    expect(cues).toEqual([{ kind: 'equip', side: 'sente', pieceId: fu.id, cardId: 'tenma' }]);
  });

  it('韋駄天：move と second', () => {
    const s = base();
    const fu = put(s, sq(4, 6), 'FU', 'sente', { equip: 'idaten' });
    const cues = cuesOf(s, {
      type: 'move', from: sq(4, 6), to: sq(4, 5), promote: false, second: { to: sq(4, 4), promote: false },
    });
    expect(cues).toEqual([
      { kind: 'move', side: 'sente', pieceId: fu.id, from: sq(4, 6), to: sq(4, 5), promoted: false },
      { kind: 'second', pieceId: fu.id, from: sq(4, 5), to: sq(4, 4), promoted: false },
    ]);
  });

  it('鋼の鎧：armor', () => {
    const s = base();
    const atk = put(s, sq(4, 6), 'FU', 'sente');
    const def = put(s, sq(4, 5), 'KI', 'gote', { equip: 'hagane' });
    const cues = cuesOf(s, { type: 'move', from: sq(4, 6), to: sq(4, 5), promote: false });
    expect(cues).toEqual([{ kind: 'armor', defenderId: def.id, attackerId: atk.id, at: sq(4, 5) }]);
  });

  it('王手：check', () => {
    const s = base();
    put(s, sq(0, 5), 'HI', 'sente');
    const cues = cuesOf(s, { type: 'move', from: sq(0, 5), to: sq(0, 4), promote: false });
    expect(cues.map(c => c.kind)).toEqual(['move', 'check']);
    expect(cues[1]).toEqual({ kind: 'check', side: 'gote' });
  });

  it('決着：最後が gameOver', () => {
    const s = base();
    put(s, sq(0, 5), 'HI', 'sente');
    const cues = cuesOf(s, { type: 'move', from: sq(0, 5), to: sq(0, 0), promote: false });
    expect(cues[cues.length - 1]).toEqual({ kind: 'gameOver', result: { winner: 'sente', reason: 'king-captured' } });
    expect(cues[0]).toMatchObject({ kind: 'move', captured: { at: sq(0, 0) } });
  });

  it('小さな知らせ：passed と secondMoveSkipped', () => {
    const evs: GameEvent[] = [
      { type: 'passed', side: 'gote' }, { type: 'passed', side: 'sente' }, { type: 'secondMoveSkipped', pieceId: 3 },
    ];
    expect(planFx(evs, 'sente')).toEqual([
      { kind: 'notice', text: '相手は指せる手がないので、手番が戻りました' },
      { kind: 'notice', text: '指せる手がないので、手番が相手に移りました' },
      { kind: 'notice', text: '2回目の移動はできませんでした' },
    ]);
  });
});

describe('fxTiming', () => {
  it('演出の長さと動きを減らす設定', () => {
    expect(fxTiming({ fx: 'short', volume: 1 }, true)).toEqual({ scale: 0.5, camera: false, shake: false, flashMax: 0.4 });
    expect(fxTiming({ fx: 'long', volume: 1 }, false)).toEqual({ scale: 1, camera: true, shake: true, flashMax: 0.9 });
  });
});
