// 結果画面：中央に紅の角判「勝」「負」「引分」（Yuji Boku）、下に理由。
// ボタン「もう一度」（札見せへ）「カードを組み直す」（カード選びへ）、小さく「タイトルへ」。
// 戦績はここではなく、対局画面の onOver・投了で記録する（二重に数えないため）。
import type { CardId, Result } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { getStage } from '../../view/stage';
import { setHighlights } from '../../view/board3d';
import { LEVEL_NAME, outcomeOf, resultWords } from '../outcome';
import { showScreen, type Screen } from '../screens';
import { button, el } from './ui';

export interface ResultParams { result: Result; level: Level; deck: CardId[] }

export function resultScreen(params: unknown): Screen {
  const p = params as Partial<ResultParams> | undefined;
  const level: Level = p?.level === 'normal' || p?.level === 'strong' ? p.level : 'weak';
  const deck = p?.deck ?? [];
  const result: Result = p?.result ?? { winner: null, reason: 'move-limit' };
  return {
    mount(root) {
      const w = resultWords(result);
      const box = el('div', `page result ${outcomeOf(result)}`);
      box.dataset.screen = 'result';
      // 後ろに盤を見せる（決着でカメラが寄ったままなので、mode で普段の視点に戻す）
      const host = el('div', 'stage-host dim');
      const stage = getStage();

      const center = el('div', 'result-center');
      const seal = el('div', `hanko${w.seal.length > 1 ? ' two' : ''}`, w.seal);
      seal.setAttribute('role', 'img');
      seal.setAttribute('aria-label', w.seal === '引分' ? '引き分け' : w.seal === '勝' ? '勝ち' : '負け');
      center.append(seal, el('p', 'reason', w.reason), el('p', 'vs', `相手：${LEVEL_NAME[level]}`));

      const acts = el('nav', 'result-acts');
      acts.append(
        button('primary', 'もう一度', () => { void showScreen('reveal', { level, deck }); }),
        button('ghost', '札を組み直す', () => { void showScreen('deck', { level }); }),
        button('text', 'タイトルへ', () => { void showScreen('title'); }),
      );
      box.append(host, center, acts);
      root.append(box);
      stage.attach(host);
      stage.mode = 'match';
      setHighlights(stage, [], []);
    },
    unmount() {},
  };
}
