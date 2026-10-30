// 札の説明の場所（広い画面の左上。設計書 docs/superpowers/specs/2026-10-31-wide-match-design.md）。
// 何も選んでいないときは案内だけ、相手が札を使ったらその札を出す。自分の札の説明は hud の説明の板を上に重ねて出す。
// 広い画面でないときは CSS で隠す
import type { CardId, GameEvent, Side } from '../rules/types';
import { CARDS } from '../cards';
import { KIND_MARK, cardHtml } from './cardArt';

export interface CardPanel {
  root: HTMLElement;
  /** 相手が使った札（発動した罠も）を出す */
  showFoe(id: CardId): void;
  /** 案内だけにする */
  clear(): void;
}

const HINT = '札を押すと説明が出ます';

/** 出来事から、相手が表にした最後の札（使った札・発動した罠）。伏せただけの罠は見ない。無ければ null */
export function foeCardFrom(events: GameEvent[], me: Side): CardId | null {
  let id: CardId | null = null;
  for (const e of events) {
    if (e.type === 'cardUsed' && e.side !== me) id = e.cardId;
    else if (e.type === 'trapTriggered' && e.owner !== me) id = e.cardId;
  }
  return id;
}

/** 札の見出し：名前・「種類・コスト」・説明・種類の色 */
export function cardInfo(id: CardId): { name: string; meta: string; text: string; color: string } {
  const c = CARDS[id];
  const k = KIND_MARK[c.kind];
  return { name: c.name, meta: `${k.label}・コスト${c.cost}`, text: c.text, color: k.color };
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createCardPanel(): CardPanel {
  const root = el('aside', 'card-panel');
  root.setAttribute('aria-live', 'polite');
  const panel: CardPanel = {
    root,
    showFoe(id) {
      const info = cardInfo(id);
      root.className = `card-panel ${info.color}`;
      const art = el('div', 'cp-art');
      art.innerHTML = cardHtml(id); // 定数だけでできた文字列
      const head = el('div', 'cp-head');
      head.append(el('b', 'cp-name', info.name), el('span', 'cp-meta', info.meta));
      root.replaceChildren(el('p', 'cp-who', '相手が使った札'), art, head, el('p', 'cp-text', info.text));
    },
    clear() {
      // すでに案内だけなら作り直さない（読み上げが毎回鳴らないように）
      if (root.className === 'card-panel' && root.querySelector('.cp-hint')) return;
      root.className = 'card-panel';
      root.replaceChildren(el('p', 'cp-hint', HINT));
    },
  };
  panel.clear();
  return panel;
}
