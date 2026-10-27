import { test, expect } from 'vitest';

// lib に DOM がないので、console の型は最小のものを自前で宣言する
declare const console: { log(...args: unknown[]): void };
import { LEVELS } from '../../src/ai/levels';
import { search } from '../../src/ai/search';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';

// 1手ごとに一瞬休む。休まずに十数秒計算し続けると、vitest の内部の連絡（onTaskUpdate）が時間切れになり
// 「Unhandled Errors」が出るため
declare function setTimeout(fn: () => void, ms: number): unknown;
const breathe = (): Promise<void> => new Promise(r => { setTimeout(r, 0); });

test.each([1, 2, 3])('CPU 同士で120手指しても反則も例外も出ない（種 %i）', async seed => {
  let s = createGame({ sente: LEVELS.weak.deck, gote: LEVELS.normal.deck });
  let plies = 0;
  for (; plies < 120 && !s.result; plies++) {
    const level = s.turn === 'sente' ? 'weak' : 'normal';
    const { deck: _deck, ...opts } = LEVELS[level];
    const r = search(viewFor(s, s.turn), s.turn, { ...opts, timeLimitMs: 50, seed: seed * 1000 + plies });
    s = applyAction(s, r.action).state;
    await breathe();
  }
  console.log(`[通し] 種${seed}: ${plies}手 結果=${JSON.stringify(s.result)}`);
}, 120_000);

// 強い側の持ち込み（落雷・鋼の鎧・鏡の結界）を通しで試す。決着しなくても失敗にはしない
test('strong 同士で300手まで指しても、毎手が本当の局面で合法', async () => {
  let s = createGame({ sente: LEVELS.strong.deck, gote: LEVELS.strong.deck });
  const { deck: _deck, ...opts } = LEVELS.strong;
  let plies = 0;
  const cardsUsed: string[] = [];
  for (; plies < 300 && !s.result; plies++) {
    const r = search(viewFor(s, s.turn), s.turn, { ...opts, timeLimitMs: 50, seed: 4 * 1000 + plies });
    expect(legalActions(s)).toContainEqual(r.action);
    const a = r.action;
    if (a.type === 'card') cardsUsed.push(s.players[s.turn].cards.find(c => c.uid === a.uid)!.cardId);
    s = applyAction(s, r.action).state;
    await breathe();
  }
  console.log(`[通し] strong 同士 種4: ${plies}手 結果=${JSON.stringify(s.result)} 使ったカード=${cardsUsed.join(',')}`);
}, 600_000);

// 計画9で変えた札（押し返しの続き・成り上がり・退き陣の旗・身代わり・槍・枷）を持たせて通しで試す
test('計画9の札を持った CPU 同士で120手指しても、毎手が本当の局面で合法', async () => {
  let s = createGame({
    sente: ['oshikaeshi', 'shoryu', 'hikijin', 'bangasa', 'itetsuku'],
    gote: ['oshikaeshi', 'migawari', 'omori'],
  });
  let plies = 0;
  for (; plies < 120 && !s.result; plies++) {
    const { deck: _deck, ...opts } = LEVELS.normal;
    const r = search(viewFor(s, s.turn), s.turn, { ...opts, timeLimitMs: 50, seed: 77 + plies });
    expect(legalActions(s).length).toBeGreaterThan(0);
    s = applyAction(s, r.action).state;
    await breathe();
  }
  console.log(`[通し] 計画9の札: ${plies}手 結果=${JSON.stringify(s.result)}`);
}, 120_000);
