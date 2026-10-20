import { test, expect } from 'vitest';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { filterEventsFor, viewFor } from '../../src/rules/view';
import { CARDS, validateDeck } from '../../src/cards';
import { HAND_KINDS, opponent } from '../../src/rules/board';
import type { Action, CardId, GameState, Side } from '../../src/rules/types';

// 種（シード）付きの乱数
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_IDS = Object.keys(CARDS) as CardId[];

// validateDeck を通る組をランダムに作る
function randomDeck(rand: () => number): CardId[] {
  const deck: CardId[] = [];
  for (let tries = 0; tries < 30; tries++) {
    const id = ALL_IDS[Math.floor(rand() * ALL_IDS.length)];
    if (validateDeck([...deck, id]) === null) deck.push(id);
  }
  return deck;
}

// 行動の種類（動かす・打つ・カード）を先に選び、その中から1つ選ぶ
function pickAction(acts: Action[], rand: () => number): Action {
  const groups = (['move', 'drop', 'card'] as const)
    .map(t => acts.filter(a => a.type === t))
    .filter(g => g.length > 0);
  const g = groups[Math.floor(rand() * groups.length)];
  return g[Math.floor(rand() * g.length)];
}

function countPieces(s: GameState): number {
  const onBoard = s.board.filter(Boolean).length;
  const inHand = (['sente', 'gote'] as Side[])
    .reduce((n, side) => n + HAND_KINDS.reduce((m, k) => m + s.players[side].hand[k], 0), 0);
  return onBoard + inHand;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

test.each(range(200))('でたらめ対局 %i は例外なく決着か引き分けで終わる', seed => {
  const rand = rng(seed + 1);
  let s = createGame({ sente: randomDeck(rand), gote: randomDeck(rand) });
  let destroyed = 0;
  for (let i = 0; i < 400 && !s.result; i++) {
    const acts = legalActions(s);
    expect(acts.length).toBeGreaterThan(0);
    const { state, events } = applyAction(s, pickAction(acts, rand));
    destroyed += events.filter(e => e.type === 'destroyed').length;
    s = state;
    // 盤の駒＋持ち駒＋壊れた駒＝40（王を取って終わったときは取られた王の1枚が抜ける）
    const kingTaken = s.result?.reason === 'king-captured' ? 1 : 0;
    expect(countPieces(s) + destroyed + kingTaken).toBe(40);
    // 相手から見た局面・出来事に、こちらの罠の場所・中身が入らない
    for (const side of ['sente', 'gote'] as Side[]) {
      const foe = opponent(side);
      expect(viewFor(s, side).traps.filter(t => t.owner === foe).every(t => t.cardId === null && t.at === null)).toBe(true);
      expect(filterEventsFor(events, side)
        .filter(e => e.type === 'trapSet' && e.side === foe)
        .every(e => e.type === 'trapSet' && e.cardId === null && e.at === null)).toBe(true);
    }
  }
  expect(s.result).not.toBeNull();
});
