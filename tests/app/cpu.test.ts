import { test, expect } from 'vitest';
import { createRestartingCpu } from '../../src/app/cpu';
import type { WorkerLike } from '../../src/ai/client';
import { handleThinkRequest, type ThinkRequest } from '../../src/ai/protocol';
import { LEVELS } from '../../src/ai/levels';
import { createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';

type Fake = WorkerLike & { terminated: boolean; silent: boolean };

// 偽の Worker：silent なら答えず、そうでなければ handleThinkRequest で答える
function fake(silent = false): Fake {
  const w: Fake = {
    onmessage: null, onerror: null, terminated: false, silent,
    postMessage(m: ThinkRequest) {
      if (w.silent) return;
      Promise.resolve().then(() => w.onmessage?.({ data: handleThinkRequest(m) }));
    },
    terminate() { w.terminated = true; },
  };
  return w;
}

const decks = { sente: LEVELS.weak.deck, gote: LEVELS.weak.deck };
const state = createGame(decks);
const ask = (c: ReturnType<typeof createRestartingCpu>, seed = 1) =>
  c.think(viewFor(state, 'sente'), 'sente', 'weak', seed);

function maker(...workers: Fake[]) {
  let n = 0;
  const f = () => workers[n++];
  return { f, count: () => n };
}

test('落ちたあと、次の頼みは新しい Worker が答える', async () => {
  const first = fake(true);
  const second = fake();
  const m = maker(first, second);
  const cpu = createRestartingCpu(m.f);
  const pending = ask(cpu);
  const r = expect(pending).rejects.toThrow('CPU が止まりました');
  first.onerror?.(new Error('boom'));
  await r;
  expect(m.count()).toBe(1);
  const a = await ask(cpu, 2);
  expect(m.count()).toBe(2);
  expect(first.terminated).toBe(true);
  expect(legalActions(state)).toContainEqual(a);
});

test('落ちていなければ作り直さない', async () => {
  const m = maker(fake(), fake());
  const cpu = createRestartingCpu(m.f);
  await ask(cpu, 1);
  await ask(cpu, 2);
  await ask(cpu, 3);
  expect(m.count()).toBe(1);
});

test('dispose 後は作り直さない', async () => {
  const first = fake(true);
  const m = maker(first, fake());
  const cpu = createRestartingCpu(m.f);
  // 一度頼んで落とし、その頼みの失敗を受け取ってから dispose する
  const p = ask(cpu);
  first.onerror?.(new Error('boom'));
  await expect(p).rejects.toThrow('CPU が止まりました');
  cpu.dispose();
  await expect(ask(cpu)).rejects.toThrow('CPU を止めました');
  expect(m.count()).toBe(1);
});
