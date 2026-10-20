import { test, expect } from 'vitest';
import { createCpuClient, type WorkerLike } from '../../src/ai/client';
import { handleThinkRequest, type ThinkRequest } from '../../src/ai/protocol';
import { LEVELS } from '../../src/ai/levels';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { idx } from '../../src/rules/board';
import type { Action, GameState, Side } from '../../src/rules/types';

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
  const a = await client.think(viewFor(s, 'sente'), 'sente', 'weak', 1);
  expect(legalActions(s)).toContainEqual(a);
});

// 偽の Worker：2件頼まれたら、頼まれたのと逆の順番で答える（id の対応づけを確かめるため）
function reversingWorker(): WorkerLike {
  const queued: ThinkRequest[] = [];
  const w: WorkerLike = {
    onmessage: null,
    postMessage(m: ThinkRequest) {
      queued.push(m);
      if (queued.length < 2) return;
      Promise.resolve().then(() => {
        for (const req of queued.reverse()) w.onmessage?.({ data: handleThinkRequest(req) });
      });
    },
  };
  return w;
}

// 行動がどちらの側のものか：駒を動かす手は from の駒、打つ手は手番、カードの手は uid の持ち主
function actionSide(s: GameState, a: Action): Side | undefined {
  if (a.type === 'move') return s.board[idx(a.from)]?.side;
  if (a.type === 'drop') return s.turn;
  return (['sente', 'gote'] as const).find(side => s.players[side].cards.some(c => c.uid === a.uid));
}

test('続けて2回頼んで逆の順番で答えが来ても、それぞれの答えが混ざらない', async () => {
  const sente = createGame(decks);
  const gote = applyAction(sente, legalActions(sente)[0]).state;
  expect(gote.turn).toBe('gote');
  const client = createCpuClient(reversingWorker());
  const [a, b] = await Promise.all([
    client.think(viewFor(sente, 'sente'), 'sente', 'weak', 1),
    client.think(viewFor(gote, 'gote'), 'gote', 'weak', 1),
  ]);
  expect(legalActions(sente)).toContainEqual(a);
  expect(legalActions(gote)).toContainEqual(b);
  expect(actionSide(sente, a)).toBe('sente');
  expect(actionSide(gote, b)).toBe('gote');
});

test('終わった対局を頼むと reject', async () => {
  const s: GameState = { ...createGame(decks), result: { winner: 'sente', reason: 'king-captured' } };
  const client = createCpuClient(fakeWorker());
  await expect(client.think(viewFor(s, 'gote'), 'gote', 'weak', 1)).rejects.toThrow('対局はもう終わっています');
});

test('手番でない側として頼むと reject', async () => {
  const s = createGame(decks);
  expect(s.turn).toBe('sente');
  const client = createCpuClient(fakeWorker());
  await expect(client.think(viewFor(s, 'gote'), 'gote', 'weak', 1)).rejects.toThrow('CPU の手番ではありません');
});
