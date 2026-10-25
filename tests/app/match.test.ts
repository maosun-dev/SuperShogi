import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMatch, type Presenter, type Step } from '../../src/app/match';
import type { CpuClient } from '../../src/ai/client';
import { legalActions } from '../../src/rules/game';
import { emptyState, put, giveCard, setTrap } from '../helpers';
import type { Action, CardId, GameState } from '../../src/rules/types';

afterEach(() => vi.restoreAllMocks());

// 偽の演出役：受け取った Step をためる
function fakePresenter() {
  const steps: Step[] = [];
  const presenter: Presenter = { present: async (s) => { steps.push(s); } };
  return { steps, presenter };
}

// 偽の CPU：頼まれた局面の legalActions から選ぶ（pick で選び方を変えられる）
function pickingCpu(pick: (legal: Action[]) => Action = (l) => l[0]): CpuClient & { seen: GameState[] } {
  const seen: GameState[] = [];
  return {
    seen,
    think: async (view, side) => {
      seen.push(view);
      return pick(legalActions({ ...view, turn: side }));
    },
    dispose() {},
  };
}

// 答えを保留する偽の CPU
function pendingCpu() {
  let release!: (a: Action) => void;
  const cpu: CpuClient = { think: () => new Promise<Action>((r) => { release = r; }), dispose() {} };
  return { cpu, answer: (a: Action) => release(a) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('対局の進行役', () => {
  it('CPU 側に駒落ちを付けると CPU が先に指し、start のあと人間の手番になる', async () => {
    const { steps, presenter } = fakePresenter();
    const m = createMatch({
      level: 'weak', humanDeck: [], cpu: pickingCpu(), presenter, seed: 1,
      handicap: { side: 'gote', kind: 'kaku' },
    });
    expect(m.phase()).toBe('cpu');
    await m.start();
    expect(steps).toHaveLength(1);
    expect(steps[0].actor).toBe('gote');
    expect(m.phase()).toBe('human');
    expect(m.view().turn).toBe('sente');
  });

  it('くじで CPU が先手なら CPU が先に指す（駒落ちがあれば駒落ちが勝つ）', async () => {
    const { steps, presenter } = fakePresenter();
    const m = createMatch({ level: 'weak', humanDeck: [], cpu: pickingCpu(), presenter, seed: 1, first: 'gote' });
    expect(m.phase()).toBe('cpu');
    await m.start();
    expect(steps[0].actor).toBe('gote');
    expect(m.phase()).toBe('human');
    const h = createMatch({
      level: 'weak', humanDeck: [], cpu: pickingCpu(), presenter, seed: 1, first: 'gote',
      handicap: { side: 'sente', kind: 'kaku' },
    });
    expect(h.phase()).toBe('human');
  });

  it('稽古で決めた相手の札があれば、強さごとの札の代わりにそれを持つ', () => {
    const { presenter } = fakePresenter();
    const m = createMatch({ level: 'strong', humanDeck: [], foeDeck: ['rakurai'], cpu: pickingCpu(), presenter, seed: 1 });
    expect(m.view().players.gote.cards).toHaveLength(1);
    const n = createMatch({ level: 'strong', humanDeck: [], foeDeck: [], cpu: pickingCpu(), presenter, seed: 1 });
    expect(n.view().players.gote.cards).toHaveLength(0);
  });

  it('人間の手のあと、CPU の手まで演出してから人間の手番に戻る', async () => {
    const { steps, presenter } = fakePresenter();
    const cpu = pickingCpu();
    const m = createMatch({ level: 'weak', humanDeck: [], cpu, presenter, seed: 1 });
    await m.start();
    expect(m.phase()).toBe('human');
    expect(m.legal().length).toBeGreaterThan(0);
    await m.submit(m.legal()[0]);
    expect(steps.map((s) => s.actor)).toEqual(['sente', 'gote']);
    expect(m.phase()).toBe('human');
    // CPU に渡るのは後手から見た形
    expect(cpu.seen).toHaveLength(1);
    expect(cpu.seen[0].turn).toBe('gote');
  });

  it('演出に渡るのは人間側から見た形', async () => {
    const init = emptyState('sente');
    put(init, { c: 4, r: 8 }, 'OU', 'sente');
    put(init, { c: 4, r: 0 }, 'OU', 'gote');
    giveCard(init, 'gote', 'otoshiana');
    const { steps, presenter } = fakePresenter();
    const cpu = pickingCpu((l) => l.find((a) => a.type === 'card')!);
    const m = createMatch({ level: 'weak', humanDeck: [], cpu, presenter, initial: init });
    await m.start();
    await m.submit(m.legal()[0]);
    const cpuStep = steps[1];
    expect(cpuStep.actor).toBe('gote');
    const set = cpuStep.events.find((e) => e.type === 'trapSet');
    expect(set).toMatchObject({ type: 'trapSet', side: 'gote', cardId: null, at: null });
    expect(cpuStep.after.traps).toHaveLength(1);
    expect(cpuStep.after.traps[0]).toMatchObject({ owner: 'gote', cardId: null, at: null });
  });

  it('CPU の伏せた罠があっても、人間の行動の一覧は本当の局面と同じ', async () => {
    const real = emptyState('sente');
    put(real, { c: 4, r: 8 }, 'OU', 'sente');
    put(real, { c: 4, r: 0 }, 'OU', 'gote');
    put(real, { c: 2, r: 6 }, 'FU', 'sente');
    put(real, { c: 2, r: 5 }, 'KA', 'sente');
    const all: CardId[] = [
      'oshikaeshi', 'irekae', 'rakurai', 'kakuotoshi', 'shoryu', 'yobimodoshi', 'otoshiana', 'itetsuku',
      'kagami', 'narifuuji', 'aiuchi', 'migawari', 'tenma', 'hagane', 'hikijin', 'tsuranuki', 'omori', 'idaten',
    ];
    for (const c of all) giveCard(real, 'sente', c);
    setTrap(real, 'gote', 'otoshiana', { c: 2, r: 4 });
    setTrap(real, 'gote', 'kagami');
    setTrap(real, 'gote', 'narifuuji');
    const expected = legalActions(real);
    expect(expected.length).toBeGreaterThan(0);
    const m = createMatch({
      level: 'weak', humanDeck: [], cpu: pickingCpu(), presenter: fakePresenter().presenter,
      initial: structuredClone(real),
    });
    await m.start();
    expect(m.legal()).toEqual(expected);
    expect(m.legal()).toEqual(legalActions(m.view()));
  });

  it('演出中・CPU の思考中の submit は無視', async () => {
    const { steps, presenter } = fakePresenter();
    const { cpu, answer } = pendingCpu();
    const m = createMatch({ level: 'weak', humanDeck: [], cpu, presenter });
    await m.start();
    const first = m.legal()[0];
    const p1 = m.submit(first);
    await tick();
    expect(m.phase()).toBe('cpu');
    expect(m.legal()).toEqual([]);
    await m.submit(first); // 人間の手番ではないので何も起きない
    expect(steps).toHaveLength(1);
    expect(m.view().ply).toBe(1);
    answer(legalActions({ ...m.view(), turn: 'gote' })[0]);
    await p1;
    expect(steps).toHaveLength(2);
    expect(m.view().ply).toBe(2);
    expect(m.phase()).toBe('human');
  });

  it.each(['reject', 'illegal'] as const)('CPU が失敗しても対局は続く（%s）', async (mode) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { steps, presenter } = fakePresenter();
    const cpu: CpuClient = {
      think: async () => {
        if (mode === 'reject') throw new Error('壊れた');
        // 後手の番に先手の駒を動かそうとする反則の手
        return { type: 'move', from: { c: 0, r: 8 }, to: { c: 0, r: 7 }, promote: false };
      },
      dispose() {},
    };
    const m = createMatch({ level: 'weak', humanDeck: [], cpu, presenter });
    await m.start();
    await m.submit(m.legal()[0]);
    expect(steps).toHaveLength(2);
    expect(steps[1].actor).toBe('gote');
    expect(m.view().ply).toBe(2);
    expect(m.phase()).toBe('human');
    expect(warn).toHaveBeenCalled();
  });

  it('途中で dispose すると、あとから届いた答えでは何も起きない', async () => {
    const { steps, presenter } = fakePresenter();
    const onOver = vi.fn();
    const { cpu, answer } = pendingCpu();
    const m = createMatch({ level: 'weak', humanDeck: [], cpu, presenter, onOver });
    await m.start();
    const p = m.submit(m.legal()[0]);
    await tick();
    const reply = legalActions({ ...m.view(), turn: 'gote' })[0];
    m.dispose();
    expect(m.phase()).toBe('disposed');
    answer(reply);
    await p;
    expect(steps).toHaveLength(1);
    expect(onOver).not.toHaveBeenCalled();
    expect(m.phase()).toBe('disposed');
  });

  it('決着したら onOver を1回呼び、そのあとの submit は無視', async () => {
    const init = emptyState('sente');
    put(init, { c: 4, r: 8 }, 'OU', 'sente');
    put(init, { c: 0, r: 0 }, 'OU', 'gote');
    put(init, { c: 0, r: 5 }, 'HI', 'sente');
    const { steps, presenter } = fakePresenter();
    const onOver = vi.fn();
    const m = createMatch({ level: 'weak', humanDeck: [], cpu: pickingCpu(), presenter, onOver, initial: init });
    await m.start();
    const take = m.legal().find((a) => a.type === 'move' && a.to.c === 0 && a.to.r === 0)!;
    expect(take).toBeDefined();
    await m.submit(take);
    expect(onOver).toHaveBeenCalledTimes(1);
    expect(onOver).toHaveBeenCalledWith({ winner: 'sente', reason: 'king-captured' });
    expect(m.phase()).toBe('over');
    expect(m.result()).toEqual({ winner: 'sente', reason: 'king-captured' });
    await m.submit(take);
    expect(steps).toHaveLength(1);
    expect(onOver).toHaveBeenCalledTimes(1);
  });
});
