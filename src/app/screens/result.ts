// 結果画面（仮）：勝ち負けと理由、「もう一度」「タイトルへ」だけ。タスク13で仕上げる
import type { CardId, Result } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { showScreen, type Screen } from '../screens';

export interface ResultParams { result: Result; level: Level; deck: CardId[] }

function words(r: Result): { seal: string; reason: string } {
  if (r.winner === 'sente') return { seal: '勝', reason: '王を取りました' };
  if (r.winner === 'gote') return { seal: '負', reason: '王を取られました' };
  return { seal: '引分', reason: r.reason === 'repetition' ? '同じ局面が4回出ました' : '300手を超えました' };
}

export function resultScreen(params: unknown): Screen {
  const p = params as ResultParams | undefined;
  return {
    mount(root) {
      const box = document.createElement('div');
      box.className = 'screen result';
      box.dataset.screen = 'result';
      const w = p ? words(p.result) : { seal: '結果', reason: '' };
      const seal = document.createElement('div');
      seal.className = 'name';
      seal.textContent = w.seal;
      const reason = document.createElement('p');
      reason.className = 'reason';
      reason.textContent = w.reason;
      const nav = document.createElement('div');
      nav.className = 'nav';
      const again = document.createElement('button');
      again.type = 'button';
      again.textContent = 'もう一度';
      again.addEventListener('click', () => { void showScreen('match', p ? { level: p.level, deck: p.deck } : undefined); });
      const title = document.createElement('button');
      title.type = 'button';
      title.textContent = 'タイトルへ';
      title.addEventListener('click', () => { void showScreen('title'); });
      nav.append(again, title);
      box.append(seal, reason, nav);
      root.append(box);
    },
    unmount() {},
  };
}
