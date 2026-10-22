// タイトル画面：3D の盤がゆっくり回る。右上に題字（大きな筆の「超」、後ろに朱の払い、左下に小さな「将棋」、
// その下に一言の短冊）、
// 下に千社札の形の縦長ボタン「対局」「カード図鑑」、左下に小さな角印「設」（設定）。
import { getStage } from '../../view/stage';
import { sync } from '../../view/pieces3d';
import { setHighlights } from '../../view/board3d';
import { titleView } from '../dev';
import { showScreen, type Screen } from '../screens';
import { button, el } from './ui';

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
      // 「超」を大きく、「将棋」は小さく左下に縦に積む（writing-mode は iPhone の Safari で幅を取り違えるため使わない）
      const h1 = el('h1');
      h1.setAttribute('aria-label', '超将棋');
      const cho = el('span', 'cho', '超');
      cho.setAttribute('aria-hidden', 'true');
      const shogi = el('span', 'shogi');
      shogi.setAttribute('aria-hidden', 'true');
      for (const ch of '将棋') shogi.append(el('span', '', ch));
      h1.append(cho, shogi);
      // 何が「超」なのかを一言で（ストアの副題と同じ言葉）
      const tag = el('p', 'tagline', '札が盤をひっくり返す将棋');
      logo.append(h1, tag);

      const nav = el('nav', 'fuda-row');
      nav.setAttribute('aria-label', 'はじめる');
      const play = button('fuda wana', '対局', () => { void showScreen('level'); });
      const zukan = button('fuda mahou', '札図鑑', () => { void showScreen('zukan'); });
      nav.append(play, zukan);

      const seal = button('kakuin', '設', () => { void showScreen('settings'); });
      seal.setAttribute('aria-label', '設定');

      box.append(host, logo, nav, seal);
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
