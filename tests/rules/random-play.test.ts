import { test, expect } from 'vitest';
import { makeRng } from '../../src/ai/random';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { filterEventsFor, viewFor } from '../../src/rules/view';
import { CARDS, validateDeck } from '../../src/cards';
import { HAND_KINDS, opponent, positionKey } from '../../src/rules/board';
import type { Action, CardId, GameState, Side } from '../../src/rules/types';

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

// 各対局の前に一瞬休む。200局を休まず続けると vitest の内部の連絡（onTaskUpdate）が60秒で時間切れになり
// 「Unhandled Errors」が出るため（テストの合間に連絡を処理する機会を作る）
declare function setTimeout(fn: () => void, ms: number): unknown;
const breathe = (): Promise<void> => new Promise(r => { setTimeout(r, 0); });

test.each(range(200))('でたらめ対局 %i は例外なく決着か引き分けで終わる', async seed => {
  await breathe();
  const rand = makeRng(seed + 1);
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
      expect(positionKey(viewFor(s, side))).toBe(positionKey(s));
      expect(viewFor(s, side).traps.filter(t => t.owner === foe).every(t => t.cardId === null && t.at === null)).toBe(true);
      expect(filterEventsFor(events, side)
        .filter(e => e.type === 'trapSet' && e.side === foe)
        .every(e => e.type === 'trapSet' && e.cardId === null && e.at === null)).toBe(true);
    }
  }
  expect(s.result).not.toBeNull();
});
