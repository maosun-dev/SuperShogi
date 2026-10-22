// 大きな札と説明（図鑑と札選びで使う）。札を押すと開き、下にその場でできること（入れる・抜く）と「閉じる」を出す
import type { CardId } from '../../rules/types';
import { CARDS } from '../../cards';
import { KIND_MARK, cardHtml } from '../../view/cardArt';
import { button, el } from './ui';

export interface LookAction {
  label: string;
  disabled?: boolean;
  note?: string;      // ボタンの下に出す理由（押せないときなど）
  primary?: boolean;
  run(): void;
}

export interface CardLook {
  el: HTMLElement;
  open(id: CardId, from: HTMLElement, actions?: LookAction[]): void;
  close(): void;
  destroy(): void;
}

export function createCardLook(): CardLook {
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
  const acts = el('div', 'look-acts');
  about.append(head, textEl, acts);
  look.append(bigSlot, about);
  look.setAttribute('aria-labelledby', 'look-name');
  nameEl.id = 'look-name';

  let opener: HTMLElement | null = null;
  const close = (): void => {
    if (look.hidden) return;
    look.hidden = true;
    // 押した札が描き直されて消えていたら、同じ札のボタンを探して枠を戻す
    const back = opener?.isConnected ? opener : null;
    back?.focus();
    opener = null;
  };
  const open = (id: CardId, from: HTMLElement, actions: LookAction[] = []): void => {
    const c = CARDS[id];
    const k = KIND_MARK[c.kind];
    opener = from;
    about.className = `about ${k.color}`;
    bigSlot.innerHTML = cardHtml(id, { size: 'large' }); // 定数だけでできた文字列
    nameEl.textContent = c.name;
    metaEl.textContent = `${k.label}・コスト${c.cost}`;
    textEl.textContent = c.text;
    acts.replaceChildren();
    let first: HTMLButtonElement | null = null;
    for (const a of actions) {
      const wrap = el('div', 'look-act');
      const b = button(a.primary ? 'look-do primary-do' : 'look-do', a.label, () => { a.run(); });
      b.disabled = !!a.disabled;
      wrap.append(b);
      if (a.note) {
        const n = el('small', 'look-note', a.note);
        n.id = `look-note-${id}`;
        b.setAttribute('aria-describedby', n.id);
        wrap.append(n);
      }
      acts.append(wrap);
      if (!first && !b.disabled) first = b;
    }
    const closeBtn = button('close', '閉じる', close);
    acts.append(closeBtn);
    look.hidden = false;
    (first ?? closeBtn).focus();
  };
  // 札の外側（暗い所）をタップしても閉じる
  look.addEventListener('click', (e) => { if (e.target === look) close(); });
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !look.hidden) close(); };
  window.addEventListener('keydown', onKey);

  return {
    el: look,
    open,
    close,
    destroy() { window.removeEventListener('keydown', onKey); look.remove(); },
  };
}
