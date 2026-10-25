// 遊び方の絵巻：和紙の頁6枚を横に並べ、指で送るか下の「◀」「▶」でめくる。タイトルの角印「学」から開く
// （初めての対局の前に自動で挟むのは、読む気が失せるとのことでやめた）
import { KIND_MARK } from '../../view/cardArt';
import { showScreen, type Screen } from '../screens';
import { HOWTO_PAGES, type HowtoFigure, type HowtoPage } from '../howto/pages';
import { diagramFor, type DiagramKind } from '../howto/pieceDiagram';
import { loadSettings, safeStore } from '../storage';
import { effectiveMotion, prefersReducedMotion } from '../stageTheme';
import { button, el, pageHead } from './ui';

const PAGE_NO = ['一', '二', '三', '四', '五', '六'];
const READING: Record<DiagramKind, string> = {
  OU: 'おう', HI: 'ひしゃ', KA: 'かく', KI: 'きん', GI: 'ぎん', KE: 'けいま', KY: 'きょうしゃ', FU: 'ふ', RYU: 'りゅう', UMA: 'うま',
};

// 図の大きさ：5×5 のマスを 18 ずつ、盤の外に 5 の縁
const CELL = 18;
const EDGE = 5;
const cx = (c: number) => EDGE + c * CELL + CELL / 2;

/** 駒1つの図（SVG の文字列。中身は定数と数だけ） */
export function pieceSvg(kind: DiagramKind): string {
  const d = diagramFor(kind);
  const full = EDGE * 2 + d.size * CELL;
  let grid = '';
  for (let i = 1; i < d.size; i++) {
    const p = EDGE + i * CELL;
    grid += `M${p} ${EDGE}V${full - EDGE}M${EDGE} ${p}H${full - EDGE}`;
  }
  // 線：向きごとに、真ん中のマスの縁から盤の端まで筆で引く（どこまでも進める）
  const dirs = new Set<string>();
  for (const r of d.rays) dirs.add(`${Math.sign(r.c - d.center.c)},${Math.sign(r.r - d.center.r)}`);
  const o = cx(d.center.c);
  const rays = [...dirs].map((k) => {
    const [ux, uy] = k.split(',').map(Number);
    const start = CELL * 0.42;
    const len = CELL * 2.5 - 2;
    return `<line class="ray" x1="${o + ux * start}" y1="${o + uy * start}" x2="${o + ux * len}" y2="${o + uy * len}"/>`;
  }).join('');
  // 点：朱肉の印。少しずつ大きさを変えて手で押した感じに
  const dots = d.dots.map((s, i) => `<circle class="dot" cx="${cx(s.c)}" cy="${cx(s.r)}" r="${4.2 + (i % 3) * 0.3}"/>`).join('');
  // 駒：五角形（先が上＝相手の方）
  const w = CELL * 0.8, h = CELL * 0.9, top = o - h / 2;
  const koma = `<path class="koma" d="M${o} ${top}L${o + w * 0.4} ${top + h * 0.22}L${o + w / 2} ${top + h}L${o - w / 2} ${top + h}L${o - w * 0.4} ${top + h * 0.22}Z"/>`
    + `<text class="koma-ch" x="${o}" y="${top + h * 0.72}">${d.label}</text>`;
  return `<svg class="piece-fig" viewBox="0 0 ${full} ${full}" aria-hidden="true">`
    + `<rect class="ban" x="${EDGE}" y="${EDGE}" width="${full - EDGE * 2}" height="${full - EDGE * 2}"/>`
    + `<path class="grid" d="${grid}"/>${rays}${dots}${koma}</svg>`;
}

function figureEl(f: HowtoFigure): HTMLElement | null {
  if (f.type === 'pieces') {
    const box = el('div', `pieces n${f.kinds.length}`);
    for (const k of f.kinds) {
      const fig = el('figure');
      fig.innerHTML = pieceSvg(k); // 定数と数だけでできた文字列
      const cap = el('figcaption');
      cap.append(el('b', '', diagramFor(k).label), el('span', '', READING[k]));
      fig.setAttribute('aria-label', `${diagramFor(k).label}（${READING[k]}）の動き`);
      fig.append(cap);
      box.append(fig);
    }
    return box;
  }
  if (f.type === 'kinds') {
    const box = el('dl', 'kinds');
    for (const it of f.items) {
      const m = KIND_MARK[it.kind];
      const dt = el('dt', m.color);
      dt.append(el('span', 'seal', m.mark), document.createTextNode(m.label));
      box.append(dt, el('dd', '', it.text));
    }
    return box;
  }
  return null;
}

function leafEl(p: HowtoPage, i: number): HTMLElement {
  const leaf = el('article', 'leaf');
  leaf.setAttribute('aria-label', `${i + 1}枚目：${p.title}`);
  const no = el('span', 'no', PAGE_NO[i]);
  no.setAttribute('aria-hidden', 'true');
  const body = el('div', 'leaf-body');
  body.append(el('h2', '', p.title));
  for (const t of p.lines) body.append(el('p', '', t));
  const fig = figureEl(p.figure);
  if (fig) body.append(fig);
  for (const t of p.after ?? []) body.append(el('p', '', t));
  leaf.append(no, body);
  return leaf;
}

export function howtoScreen(): Screen {
  let box: HTMLElement | null = null;
  let leaving = false;
  // タイトルへ戻るのは1回だけ（連打で2回切り替えない）
  const close = () => {
    if (leaving) return;
    leaving = true;
    void showScreen('title');
  };

  return {
    mount(root) {
      const low = effectiveMotion(loadSettings(safeStore()).motion, prefersReducedMotion()) === 'low';
      box = el('div', 'howto');
      box.dataset.screen = 'howto';
      const head = pageHead('遊び方', close);

      const scroll = el('div', 'leaves');
      HOWTO_PAGES.forEach((p, i) => scroll.append(leafEl(p, i)));

      const nav = el('nav', 'howto-nav');
      nav.setAttribute('aria-label', '頁をめくる');
      const prev = button('turn prev', '◀');
      prev.setAttribute('aria-label', '前の頁');
      const marks = el('div', 'marks');
      marks.setAttribute('aria-hidden', 'true');
      const markEls = HOWTO_PAGES.map(() => marks.appendChild(el('i')));
      const fwd = button('turn fwd', '▶');
      fwd.setAttribute('aria-label', '次の頁');
      const done = button('done', '閉じる', close);
      nav.append(prev, marks, fwd, done);

      let at = 0;
      const show = (i: number) => {
        at = i;
        markEls.forEach((m, k) => m.classList.toggle('on', k === i));
        prev.disabled = i === 0;
        const last = i === HOWTO_PAGES.length - 1;
        fwd.hidden = last;
        done.hidden = !last;
      };
      const turn = (d: number) => {
        const i = Math.max(0, Math.min(HOWTO_PAGES.length - 1, at + d));
        scroll.scrollTo({ left: i * scroll.clientWidth, behavior: low ? 'auto' : 'smooth' });
        show(i);
      };
      prev.addEventListener('click', () => turn(-1));
      fwd.addEventListener('click', () => turn(1));
      // 指で送ったときは、止まった位置の頁に印を合わせる
      scroll.addEventListener('scroll', () => {
        const w = scroll.clientWidth;
        if (w > 0) {
          const i = Math.round(scroll.scrollLeft / w);
          if (i !== at) show(i);
        }
      }, { passive: true });
      show(0);

      box.append(head, scroll, nav);
      root.append(box);
    },
    unmount() {
      box?.remove();
      box = null;
    },
  };
}
