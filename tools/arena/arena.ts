// CPU 同士を戦わせて記録を取る道具（パソコンで動かす。アプリには入れない）。
// 1つの組（shard）ぶんの対局を指し、1局ごとに1行の JSON を標準出力へ書く。
// 使い方：npx vite-node tools/arena/arena.ts -- <mode> <games> <shard> <shards> <seed> <timeScale>
//   mode=levels：強さどうし（weak-normal / normal-strong / weak-strong）。先後は交互
//   mode=cards ：同じ強さ（normal）どうしで、持ち込みをでたらめに組む
import { LEVELS, chooseCpuAction, type Level } from '../../src/ai/levels';
import { makeRng } from '../../src/ai/random';
import { applyAction, createGame } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { CARDS, validateDeck } from '../../src/cards';
import type { Action, CardId, GameState, Side } from '../../src/rules/types';

export interface GameRecord {
  mode: string;
  sente: { level: Level; deck: CardId[] };
  gote: { level: Level; deck: CardId[] };
  winner: Side | null;
  reason: string;
  plies: number;
  maxMs: Record<Side, number>;    // 1手にかかったいちばん長い時間
  avgMs: Record<Side, number>;
  cardsUsed: Record<Side, CardId[]>;
}

const ALL = Object.keys(CARDS) as CardId[];

// コスト10以内・同じ札2枚までで、でたらめに組む（だいたい 3〜5 枚）
export function randomDeck(rand: () => number): CardId[] {
  const deck: CardId[] = [];
  for (let tries = 0; tries < 40; tries++) {
    const id = ALL[Math.floor(rand() * ALL.length)];
    if (validateDeck([...deck, id]) === null) deck.push(id);
  }
  return deck;
}

// CPU の1手。アプリと同じ chooseCpuAction で、考える時間だけ timeScale 倍にする
function think(s: GameState, level: Level, seed: number, timeScale: number): Action {
  return chooseCpuAction(viewFor(s, s.turn), s.turn, level, seed, timeScale).action;
}

export function playGame(
  mode: string, players: Record<Side, { level: Level; deck: CardId[] }>, seed: number, timeScale: number,
): GameRecord {
  let s = createGame({ sente: players.sente.deck, gote: players.gote.deck });
  const total: Record<Side, number> = { sente: 0, gote: 0 };
  const count: Record<Side, number> = { sente: 0, gote: 0 };
  const maxMs: Record<Side, number> = { sente: 0, gote: 0 };
  const cardsUsed: Record<Side, CardId[]> = { sente: [], gote: [] };
  let steps = 0;
  while (!s.result) {
    const side = s.turn;
    const t0 = performance.now();
    const a = think(s, players[side].level, seed * 7919 + steps, timeScale);
    const ms = performance.now() - t0;
    total[side] += ms; count[side]++; maxMs[side] = Math.max(maxMs[side], ms);
    if (a.type === 'card') cardsUsed[side].push(s.players[side].cards.find(c => c.uid === a.uid)!.cardId);
    s = applyAction(s, a).state;
    steps++;
  }
  const r = s.result;
  return {
    mode,
    sente: players.sente,
    gote: players.gote,
    winner: r.winner,
    reason: r.reason,
    plies: s.ply,
    maxMs: { sente: Math.round(maxMs.sente), gote: Math.round(maxMs.gote) },
    avgMs: { sente: Math.round(total.sente / Math.max(1, count.sente)), gote: Math.round(total.gote / Math.max(1, count.gote)) },
    cardsUsed,
  };
}

const PAIRS: [Level, Level][] = [['weak', 'normal'], ['normal', 'strong'], ['weak', 'strong']];

// n 局目の組み合わせ。強さどうしは組を順に回し、先後を交互にする
function setup(mode: string, n: number, rand: () => number): Record<Side, { level: Level; deck: CardId[] }> {
  if (mode === 'cards') {
    return { sente: { level: 'normal', deck: randomDeck(rand) }, gote: { level: 'normal', deck: randomDeck(rand) } };
  }
  const [a, b] = PAIRS[n % PAIRS.length];
  const flip = Math.floor(n / PAIRS.length) % 2 === 1;
  const [x, y] = flip ? [b, a] : [a, b];
  return { sente: { level: x, deck: LEVELS[x].deck }, gote: { level: y, deck: LEVELS[y].deck } };
}

function main(): void {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const [mode = 'levels', gamesS = '6', shardS = '0', shardsS = '1', seedS = '1', scaleS = '0.1'] = args;
  const games = Number(gamesS), shard = Number(shardS), shards = Number(shardsS), seed = Number(seedS), scale = Number(scaleS);
  for (let n = shard; n < games; n += shards) {
    const rand = makeRng(seed * 100_003 + n);
    const rec = playGame(mode, setup(mode, n, rand), seed * 1_000 + n, scale);
    process.stdout.write(JSON.stringify({ n, ...rec }) + '\n');
  }
}

main();
