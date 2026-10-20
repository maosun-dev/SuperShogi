// 強さ選び：3枚の札「弱い」「ふつう」「強い」を縦に並べる。各札に CPU の持ち込みの小さな札と、その強さの戦績
import type { Level } from '../../ai/levels';
import { LEVELS } from '../../ai/levels';
import { cardHtml } from '../../view/cardArt';
import { loadTally, safeStore } from '../storage';
import { LEVEL_NAME, tallyText } from '../outcome';
import { showScreen, type Screen } from '../screens';
import { el, pageHead } from './ui';

const ORDER: Level[] = ['weak', 'normal', 'strong'];

export function levelScreen(): Screen {
  return {
    mount(root) {
      const box = el('div', 'page level');
      box.dataset.screen = 'level';
      const store = safeStore();
      const list = el('div', 'level-list');
      for (const lv of ORDER) {
        const t = tallyText(loadTally(store, lv));
        const b = el('button', `level-fuda ${lv}`);
        b.type = 'button';
        b.setAttribute('aria-label', `${LEVEL_NAME[lv]}。戦績 ${t}`);
        const name = el('span', 'lv-name', LEVEL_NAME[lv]);
        const tally = el('span', 'lv-tally', t);
        const cards = el('span', 'lv-cards');
        cards.setAttribute('aria-hidden', 'true');
        cards.innerHTML = LEVELS[lv].deck.map((id) => cardHtml(id, { size: 'small' })).join(''); // 定数だけでできた文字列
        b.append(name, tally, cards);
        b.addEventListener('click', () => { void showScreen('deck', { level: lv }); });
        list.append(b);
      }
      box.append(pageHead('強さ選び', 'title'), el('p', 'lead', '相手の強さを選んでください。札は相手の持ち込みです。'), list);
      root.append(box);
    },
    unmount() {},
  };
}
