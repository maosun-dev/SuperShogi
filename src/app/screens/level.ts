// 強さ選び：3枚の札「弱い」「ふつう」「強い」を縦に並べる。各札に CPU の持ち込みの小さな札と、その強さの戦績。
// その下に「稽古」：相手の強さと持ち込みを自分で決める（前回決めた相手を小さく見せる。戦績は数えない）
import type { Level } from '../../ai/levels';
import { LEVELS } from '../../ai/levels';
import { cardHtml } from '../../view/cardArt';
import { loadKeiko, loadTally, safeStore } from '../storage';
import { LEVEL_NAME, tallyText } from '../outcome';
import { showScreen, type Screen } from '../screens';
import { el, kujiBacksHtml, pageHead, writeKouzan } from './ui';

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
        const name = el('span', 'lv-name');
        writeKouzan(name, LEVEL_NAME[lv]);
        const tally = el('span', 'lv-tally', t);
        const cards = el('span', 'lv-cards');
        cards.setAttribute('aria-hidden', 'true');
        cards.innerHTML = LEVELS[lv].deck.map((id) => cardHtml(id, { size: 'small' })).join(''); // 定数だけでできた文字列
        b.append(name, tally, cards);
        b.addEventListener('click', () => { void showScreen('deck', { level: lv }); });
        list.append(b);
      }

      // 稽古：前回の相手（強さと札。くじなら札の裏）を見せ、押すと相手の札選びへ
      const k = loadKeiko(store);
      const kb = el('button', 'level-fuda keiko');
      kb.type = 'button';
      const kuji = k.deck === 'kuji';
      kb.setAttribute('aria-label', `稽古。相手の強さと持ち込みを自分で決める。今は${LEVEL_NAME[k.level]}、${kuji ? '札はくじ' : `札${k.deck.length}枚`}`);
      const kName = el('span', 'lv-name');
      writeKouzan(kName, '稽古');
      const kSub = el('span', 'lv-tally', `相手：${LEVEL_NAME[k.level]}`);
      const kCards = el('span', 'lv-cards');
      kCards.setAttribute('aria-hidden', 'true');
      if (k.deck === 'kuji') kCards.innerHTML = kujiBacksHtml(3, 0.486); // 定数だけでできた文字列
      else if (k.deck.length > 0) kCards.innerHTML = k.deck.map((id) => cardHtml(id, { size: 'small' })).join('');
      else kCards.append(el('span', 'lv-none', '札なし'));
      kb.append(kName, kSub, kCards, el('span', 'lv-note', '相手の強さと札を、自分で決める'));
      kb.addEventListener('click', () => { void showScreen('deck', { level: k.level, role: 'foe' }); });
      list.append(kb);

      box.append(pageHead('強さ選び', 'title'), el('p', 'lead', '相手の強さを選んでください。札は相手の持ち込みです。'), list);
      root.append(box);
    },
    unmount() {},
  };
}
