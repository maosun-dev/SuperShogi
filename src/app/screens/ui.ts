// 画面づくりの小さな道具：要素・ボタン・左上の「戻る」と見出しの帯
import { showScreen, type ScreenName } from '../screens';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(cls: string, text: string, onClick?: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** 画面の上の帯：左上に「戻る」、右に見出し（Yuji Boku） */
export function pageHead(title: string, back: ScreenName | (() => void), backParams?: unknown): HTMLElement {
  const head = el('header', 'page-head');
  const b = button('back', '戻る', () => {
    if (typeof back === 'function') back();
    else void showScreen(back, backParams);
  });
  head.append(b, el('h1', '', title));
  return head;
}
