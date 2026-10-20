import { test, expect } from 'vitest';
import { createCpuClient, type WorkerLike } from '../../src/ai/client';
import { handleThinkRequest, type ThinkRequest } from '../../src/ai/protocol';
import { LEVELS } from '../../src/ai/levels';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { idx } from '../../src/rules/board';
import type { GameState } from '../../src/rules/types';

// 偽の Worker：頼まれたら少し後で handleThinkRequest を呼び、onmessage へ返す
function fakeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(m: ThinkRequest) {
      Promise.resolve().then(() => {
        w.onmessage?.({ data: handleThinkRequest(m) });
      });
    },
  };
  return w;
}

const decks = { sente: LEVELS.weak.deck, gote: LEVELS.weak.deck };

test('考えた手が返る', async () => {
  const s = createGame(decks);
  const client = createCpuClient(fakeWorker());
  const a = await client.think(viewFor(s, 'sente'), 'weak', 1);
  expect(legalActions(s)).toContainEqual(a);
});

test('続けて2回頼んでも、それぞれの答えが混ざらない', async () => {
  const sente = createGame(decks);
  const gote = applyAction(sente, legalActions(sente)[0]).state;
  expect(gote.turn).toBe('gote');
  const client = createCpuClient(fakeWorker());
  const [a, b] = await Promise.all([
    client.think(viewFor(sente, 'sente'), 'weak', 1),
    client.think(viewFor(gote, 'gote'), 'weak', 1),
  ]);
  expect(legalActions(sente)).toContainEqual(a);
  expect(legalActions(gote)).toContainEqual(b);
  if (a.type === 'move') expect(sente.board[idx(a.from)]?.side).toBe('sente');
  if (b.type === 'move') expect(gote.board[idx(b.from)]?.side).toBe('gote');
});

test('終わった対局を頼むと reject', async () => {
  const s: GameState = { ...createGame(decks), result: { winner: 'sente', reason: 'king-captured' } };
  const client = createCpuClient(fakeWorker());
  await expect(client.think(viewFor(s, 'gote'), 'weak', 1)).rejects.toThrow('対局はもう終わっています');
});
