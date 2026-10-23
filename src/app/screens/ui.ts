// 画面づくりの小さな道具：要素・ボタン・左上の「戻る」と見出しの帯
import { showScreen, type ScreenName } from '../screens';
import { KOUZAN_GLYPHS } from '../kouzanGlyphs';

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

/**
 * 字を衡山の筆の形（SVG）で書く。表（kouzanGlyphs.ts）に無い字が1つでもあれば null（ふつうの字のまま出す）。
 * 高さは CSS の .kouzan で決める（字の大きさ 1em に合わせる）。読み上げは呼び出し側の aria-label に任せる
 */
export function kouzanSvg(text: string): string | null {
  const chars = [...text];
  if (chars.length === 0 || !chars.every((c) => c in KOUZAN_GLYPHS)) return null;
  let x = 0;
  const paths = chars.map((c) => {
    const g = KOUZAN_GLYPHS[c];
    const p = `<path transform="translate(${x} 0)" d="${g.d}"/>`;
    x += g.advance;
    return p;
  });
  return `<svg class="kouzan" viewBox="0 0 ${x} 1024" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="30" stroke-linejoin="round">${paths.join('')}</svg>`;
}

/** el に text を衡山の字で書く（無い字があればふつうの字）。読み上げ用に aria-label を付ける */
export function writeKouzan(e: HTMLElement, text: string): void {
  const svg = kouzanSvg(text);
  if (svg === null) { e.textContent = text; return; }
  e.innerHTML = svg; // 定数（字の形）だけでできた文字列
  e.setAttribute('aria-label', text);
}

/** 稽古の「くじ」：中身の見えない札の裏を n 枚。s は札の表に対する大きさ（小さな札は .486） */
export function kujiBacksHtml(n: number, s: number): string {
  return `<span class="card-back kuji" style="--s:${s}" aria-hidden="true"><i></i></span>`.repeat(n);
}

/** 画面の上の帯：左上に「戻る」、右に見出し（衡山の字） */
export function pageHead(title: string, back: ScreenName | (() => void), backParams?: unknown): HTMLElement {
  const head = el('header', 'page-head');
  const b = button('back', '戻る', () => {
    if (typeof back === 'function') back();
    else void showScreen(back, backParams);
  });
  const h1 = el('h1');
  writeKouzan(h1, title);
  head.append(b, h1);
  return head;
}
