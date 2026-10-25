// 結果画面：中央に決着で書いた筆文字「勝」「負」「引分」（衡山。書き終わりの姿）と、右下に朱の落款（天晴・無念・互角）、下に理由。
// ボタン「もう一度」（札見せへ）「カードを組み直す」（カード選びへ）、小さく「タイトルへ」。
// 戦績はここではなく、対局画面の onOver・投了で記録する（二重に数えないため）。
// 友と対局（friend）：入った時点で対局の中身を消す。「もう一度」は同じ相手と札選びから、「タイトルへ」でつながりを捨てる
import type { CardId, Result } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { getStage } from '../../view/stage';
import { setHighlights } from '../../view/board3d';
import { outcomeOf, resultWords } from '../outcome';
import { foeLabel, keikoOf, type Keiko } from '../keiko';
import { showScreen, type Screen } from '../screens';
import { button, el } from './ui';
import { brushStill, type Ink } from '../../fx/brush';
import { endSession, peekSession } from '../../net/current';

const INK: Record<'勝' | '負' | '引分', Ink> = { '勝': 'gold', '負': 'kasure', '引分': 'usuzumi' };

export interface ResultParams { result: Result; level: Level; deck: CardId[]; keiko?: Keiko; friend?: boolean }

export function resultScreen(params: unknown): Screen {
  const p = params as Partial<ResultParams> | undefined;
  const level: Level = p?.level === 'normal' || p?.level === 'strong' ? p.level : 'weak';
  const deck = p?.deck ?? [];
  const keiko = keikoOf(p?.keiko);
  const result: Result = p?.result ?? { winner: null, reason: 'move-limit' };
  const friend = p?.friend === true;
  return {
    mount(root) {
      const w = resultWords(result);
      const box = el('div', `page result ${outcomeOf(result)}`);
      box.dataset.screen = 'result';
      // 後ろに盤を見せる（決着でカメラが寄ったままなので、mode で普段の視点に戻す）
      const host = el('div', 'stage-host dim');
      const stage = getStage();

      const center = el('div', 'result-center');
      // 筆文字に落款を押した一枚
      const verdict = el('div', 'verdict');
      verdict.setAttribute('role', 'img');
      verdict.setAttribute('aria-label', w.seal === '引分' ? '引き分け' : w.seal === '勝' ? '勝ち' : '負け');
      const word = brushStill(w.seal, INK[w.seal]);
      if (w.seal.length > 1) word.classList.add('two');
      const stamp = el('div', 'rakkan');
      for (const ch of w.stamp) stamp.append(el('span', '', ch));
      verdict.append(word, stamp);
      center.append(verdict, el('p', 'reason', w.reason), el('p', 'vs', `相手：${friend ? '友' : foeLabel(level, keiko)}`));

      const acts = el('nav', 'result-acts');
      if (friend) {
        peekSession()?.finish(); // 対局の中身はここで消す（つながりは「もう一度」のために残す）
        acts.append(
          button('primary', 'もう一度', () => { void showScreen('deck', { level, friend: true }); }),
          button('text', 'タイトルへ', () => { endSession(); void showScreen('title'); }),
        );
      } else {
        acts.append(
          button('primary', 'もう一度', () => { void showScreen('reveal', { level, deck, keiko }); }),
          button('ghost', '札を組み直す', () => { void showScreen('deck', { level, keiko }); }),
          button('text', 'タイトルへ', () => { void showScreen('title'); }),
        );
      }
      box.append(host, center, acts);
      root.append(box);
      stage.attach(host);
      stage.mode = 'match';
      setHighlights(stage, [], []);
    },
    unmount() {},
  };
}
