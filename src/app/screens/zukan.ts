// カード図鑑：種類ごとの行に12枚。タップで大きな札と説明文を出す。
import type { CardId } from '../../rules/types';
import type { CardKind } from '../../cards/types';
import { CARDS } from '../../cards';
import { KIND_MARK, cardHtml } from '../../view/cardArt';
import { type Screen } from '../screens';
import { pageHead } from './ui';

const KINDS: CardKind[] = ['magic', 'trap', 'equip'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function zukanScreen(): Screen {
  let box: HTMLElement | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;

  return {
    mount(root) {
      box = el('div', 'zukan');
      const header = pageHead('カード図鑑', 'title');

      // 大きな札と説明（最初は隠す）
      const look = el('div', 'look');
      look.hidden = true;
      look.setAttribute('role', 'dialog');
      look.setAttribute('aria-modal', 'true');
      const bigSlot = el('div');
      const about = el('div', 'about');
      const head = el('div', 'head');
      const nameEl = el('b');
      const metaEl = el('span');
      head.append(nameEl, metaEl);
      const textEl = el('p');
      const close = el('button', 'close', '閉じる');
      close.type = 'button';
      about.append(head, textEl, close);
      look.append(bigSlot, about);

      let opener: HTMLElement | null = null;
      const hide = (): void => {
        look.hidden = true;
        opener?.focus();
        opener = null;
      };
      const open = (id: CardId, from: HTMLElement): void => {
        const c = CARDS[id];
        const k = KIND_MARK[c.kind];
        opener = from;
        about.className = `about ${k.color}`;
        bigSlot.innerHTML = cardHtml(id, { size: 'large' }); // 定数だけでできた文字列
        nameEl.textContent = c.name;
        metaEl.textContent = `${k.label}・コスト${c.cost}`;
        textEl.textContent = c.text;
        look.hidden = false;
        close.focus();
      };
      close.addEventListener('click', hide);
      // 札の外側（暗い所）をタップしても閉じる
      look.addEventListener('click', (e) => { if (e.target === look) hide(); });
      onKey = (e) => { if (e.key === 'Escape' && !look.hidden) hide(); };
      window.addEventListener('keydown', onKey);

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
          b.addEventListener('click', () => open(id, b));
          row.append(b);
        }
        sec.append(h2, row);
        rows.append(sec);
      }

      box.append(header, rows, look);
      root.append(box);
    },
    unmount() {
      if (onKey) window.removeEventListener('keydown', onKey);
      onKey = null;
      box?.remove();
      box = null;
    },
  };
}
