// タイトル画面：3D の盤がゆっくり回る。右上に縦書きの大きなロゴ（後ろに紅の隈取の一筆）、
// 下に千社札の形の縦長ボタン「対局」「カード図鑑」、左下に小さな角印「設」（設定）。
import { getStage } from '../../view/stage';
import { sync } from '../../view/pieces3d';
import { setHighlights } from '../../view/board3d';
import { titleView } from '../dev';
import { showScreen, type Screen } from '../screens';
import { button, el } from './ui';

// 隈取の一筆：上から下へ、途中でふくらんで先がかすれて細る形（自作の線）
const KUMA = `<svg class="kuma" viewBox="0 0 60 300" aria-hidden="true" preserveAspectRatio="none">
  <path d="M34 2 C20 30 14 70 22 118 C28 156 12 196 20 236 C24 260 30 282 27 298
    C38 270 44 240 40 204 C36 168 50 130 44 88 C40 54 44 24 34 2Z" fill="currentColor"/>
  <path d="M46 60 C52 74 50 92 47 100 M14 210 C10 226 13 242 16 250" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

export function titleScreen(): Screen {
  return {
    mount(root) {
      const box = el('div', 'title-screen');
      box.dataset.screen = 'title';
      const host = el('div', 'stage-host');

      const logo = el('div', 'logo');
      logo.innerHTML = KUMA; // 定数だけでできた文字列
      const h1 = el('h1', '', '超将棋');
      logo.append(h1);

      const nav = el('nav', 'fuda-row');
      nav.setAttribute('aria-label', 'はじめる');
      const play = button('fuda wana', '対局', () => { void showScreen('level'); });
      const zukan = button('fuda mahou', 'カード図鑑', () => { void showScreen('zukan'); });
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
