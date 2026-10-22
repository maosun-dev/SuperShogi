// カード図鑑：種類ごとの行に札を並べる。タップで大きな札と説明文を出す（cardLook）
import type { CardId } from '../../rules/types';
import type { CardKind } from '../../cards/types';
import { CARDS } from '../../cards';
import { KIND_MARK, cardHtml } from '../../view/cardArt';
import { type Screen } from '../screens';
import { createCardLook, type CardLook } from './cardLook';
import { el, pageHead } from './ui';

const KINDS: CardKind[] = ['magic', 'trap', 'equip'];

export function zukanScreen(): Screen {
  let box: HTMLElement | null = null;
  let look: CardLook | null = null;

  return {
    mount(root) {
      box = el('div', 'zukan');
      const header = pageHead('札図鑑', 'title');
      const lk = createCardLook();
      look = lk;

      // 種類ごとの行
      const rows = el('div', 'rows');
      const ids = Object.keys(CARDS) as CardId[];
      for (const kind of KINDS) {
        const k = KIND_MARK[kind];
        const mine = ids.filter((id) => CARDS[id].kind === kind).sort((a, b) => CARDS[a].cost - CARDS[b].cost);
        const sec = el('section', k.color);
        const h2 = el('h2');
        h2.append(el('span', 'seal', k.mark), document.createTextNode(k.label), el('small', '', `${mine.length}枚`));
        const row = el('div', 'row');
        for (const id of mine) {
          const b = el('button', 'pick');
          b.type = 'button';
          b.innerHTML = cardHtml(id); // 定数だけでできた文字列
          b.setAttribute('aria-label', `${CARDS[id].name}の説明を見る`);
          b.addEventListener('click', () => lk.open(id, b));
          row.append(b);
        }
        sec.append(h2, row);
        rows.append(sec);
      }

      box.append(header, rows, lk.el);
      root.append(box);
    },
    unmount() {
      look?.destroy();
      look = null;
      box?.remove();
      box = null;
    },
  };
}
