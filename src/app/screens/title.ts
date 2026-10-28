// タイトル画面：3D の盤がゆっくり回る。右上に題字（大きな筆の「傾」、後ろに朱の払い、左下に小さな「将棋」、
// その下に一言の短冊）、
// 下に千社札の形の縦長ボタン「対局」「友と対局」（アプリだけ）「札図鑑」。左から順に低くなる、左下に小さな角印「設」（設定）、右下に「学」（遊び方）。
import { getStage } from '../../view/stage';
import { sync } from '../../view/pieces3d';
import { setHighlights } from '../../view/board3d';
import { titleView } from '../dev';
import { showScreen, type Screen } from '../screens';
import { button, el } from './ui';
import { TITLE_EM, TITLE_GLYPHS } from '../titleGlyphs';
import { linkAvailable } from '../../net/link';

/** 筆の字1文字の SVG。縁（rim）を太い線で先に描き、その上に字を塗る。thick で字そのものも太らせる */
export function brushChar(ch: keyof typeof TITLE_GLYPHS, cls: string, fill: string, rim: string, rimW: number, thick: number): string {
  const d = TITLE_GLYPHS[ch];
  return `<svg class="${cls}" viewBox="-40 -40 ${TITLE_EM + 80} ${TITLE_EM + 80}" aria-hidden="true">`
    + `<path d="${d}" style="fill:${rim};stroke:${rim}" stroke-width="${rimW}" stroke-linejoin="round"/>`
    + `<path d="${d}" style="fill:${fill};stroke:${fill}" stroke-width="${thick}" stroke-linejoin="round"/></svg>`;
}

// 朱の払い：左上から右下へ、入りは太く、終わりはかすれて細る筆の一払い（自作の形）。
// かすれは feTurbulence のゆらぎで縁を荒らして出す。まわりに墨のしぶきを少し
const FUDE = `<svg class="fude" viewBox="0 0 220 200" aria-hidden="true">
  <defs>
    <filter id="kasure" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9 0.06" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <g filter="url(#kasure)">
    <path d="M14 58 C40 30 92 20 140 34 C176 44 200 70 210 104 C196 86 172 72 140 66
      C104 60 70 66 46 84 C30 96 18 92 12 78 C9 70 10 63 14 58Z" fill="currentColor"/>
    <path d="M150 74 C178 92 196 124 202 166 C190 140 172 116 146 98Z" fill="currentColor" opacity=".85"/>
  </g>
  <circle cx="30" cy="112" r="5" fill="#1D1A17"/><circle cx="44" cy="126" r="2.5" fill="#1D1A17"/>
  <circle cx="198" cy="40" r="3.5" fill="#1D1A17"/><circle cx="20" cy="132" r="1.8" fill="#1D1A17"/>
</svg>`;

export function titleScreen(): Screen {
  return {
    mount(root) {
      const box = el('div', 'title-screen');
      box.dataset.screen = 'title';
      const host = el('div', 'stage-host');

      const logo = el('div', 'logo');
      logo.innerHTML = FUDE; // 定数だけでできた文字列
      // 「傾」を大きく、「将棋」は小さく左下に縦に積む（writing-mode は iPhone の Safari で幅を取り違えるため使わない）
      const h1 = el('h1');
      h1.setAttribute('aria-label', '傾将棋（かぶきしょうぎ）');
      // 字は衡山毛筆の形（titleGlyphs.ts）。傾は墨に胡粉の縁、将棋は胡粉に墨の縁
      const cho = el('span', 'cho');
      cho.innerHTML = brushChar('傾', 'cho-svg', 'var(--sumi)', 'var(--gofun)', 80, 18); // 定数だけでできた文字列
      // ふりがな「かぶき」：「傾」の左上に、墨の細い帯に胡粉の字で縦に（writing-mode は使わず1字ずつ積む）
      const furi = el('span', 'furi');
      furi.setAttribute('aria-hidden', 'true');
      for (const ch of 'かぶき') furi.append(el('span', '', ch));
      cho.append(furi);
      const shogi = el('span', 'shogi');
      shogi.innerHTML = brushChar('将', 'sho-svg', 'var(--gofun)', 'var(--sumi)', 110, 24) + brushChar('棋', 'sho-svg', 'var(--gofun)', 'var(--sumi)', 110, 24); // 同上
      h1.append(cho, shogi);
      // どんな将棋なのかを、説明ではなく啖呵の一言で。題字の下に横書きで書き添え（板は敷かない）、
      // 「札」の字は朱の印（白抜きの「札」）に置き換える
      const rakkan = el('p', 'rakkan');
      rakkan.setAttribute('aria-label', '定跡なんぞ、札で破れ。');
      const inkan = el('span', 'inkan', '札');
      const before = el('span', '', '定跡なんぞ、');
      const after = el('span', '', 'で破れ。');
      for (const s of [before, inkan, after]) s.setAttribute('aria-hidden', 'true');
      rakkan.append(before, inkan, after);
      logo.append(h1, rakkan);

      const nav = el('nav', 'fuda-row');
      nav.setAttribute('aria-label', 'はじめる');
      const play = button('fuda wana', '対局', () => { void showScreen('level'); });
      const zukan = button('fuda mahou', '札図鑑', () => { void showScreen('zukan'); });
      // 遊ぶ札を左にまとめ、よく使う順に高く（対局・友と対局・札図鑑）。
      // 友と対局（近くの iPhone 2台）はアプリと開発中の ?link=fake でだけ出す
      nav.append(play);
      if (linkAvailable()) nav.append(button('fuda midori', '友と対局', () => { void showScreen('friend'); }));
      nav.append(zukan);

      const seal = button('kakuin', '設', () => { void showScreen('settings'); });
      seal.setAttribute('aria-label', '設定');
      // 角印「学」：遊び方の絵巻を開く（右下の角）
      const manabu = button('kakuin manabu', '学', () => { void showScreen('howto'); });
      manabu.setAttribute('aria-label', '遊び方');

      box.append(host, logo, nav, seal, manabu);
      root.append(box);

      const stage = getStage();
      stage.attach(host);
      stage.mode = 'title';
      setHighlights(stage, [], []);
      sync(stage, titleView(), 'sente');
    },
    unmount() {},
  };
}
