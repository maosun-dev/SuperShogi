// タイトル画面：3D の盤がゆっくり回る。ロゴと千社札のボタンはタスク13で仕上げる（今は行き先のボタンだけ）
import { getStage } from '../../view/stage';
import { sync } from '../../view/pieces3d';
import { setHighlights } from '../../view/board3d';
import { titleView } from '../dev';
import { ALL_SCREENS, SCREEN_LABEL, showScreen, type Screen } from '../screens';

export function titleScreen(): Screen {
  return {
    mount(root) {
      const box = document.createElement('div');
      box.className = 'screen title';
      box.dataset.screen = 'title';
      const host = document.createElement('div');
      host.className = 'stage-host';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = '超将棋';
      const nav = document.createElement('div');
      nav.className = 'nav';
      for (const to of ALL_SCREENS) {
        if (to === 'title') continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = SCREEN_LABEL[to];
        b.addEventListener('click', () => { void showScreen(to); });
        nav.append(b);
      }
      box.append(host, name, nav);
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
