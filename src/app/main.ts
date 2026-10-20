// 起動だけを受け持つ。画面の仕組みは screens.ts にある。
import '@fontsource/yuji-boku/400.css';
import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/800.css';
import './style.css';
import {
  ALL_SCREENS, SCREEN_LABEL, hasScreen, initScreens, registerScreen, showScreen,
  type Screen, type ScreenName,
} from './screens';
import { zukanScreen } from './screens/zukan';

// ---- 仮の画面（のちの作業で本物に置き換える） ----
function placeholder(name: ScreenName): Screen {
  return {
    mount(el) {
      const box = document.createElement('div');
      box.className = 'screen';
      box.dataset.screen = name;
      const title = document.createElement('div');
      title.className = 'name';
      title.textContent = SCREEN_LABEL[name];
      const nav = document.createElement('div');
      nav.className = 'nav';
      for (const to of ALL_SCREENS) {
        if (to === name) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = SCREEN_LABEL[to];
        b.addEventListener('click', () => { void showScreen(to); });
        nav.append(b);
      }
      box.append(title, nav);
      el.append(box);
    },
    unmount() {},
  };
}

function start(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app がありません');
  initScreens(root);
  registerScreen('zukan', () => zukanScreen());
  for (const n of ALL_SCREENS) {
    if (!hasScreen(n)) registerScreen(n, () => placeholder(n));
  }
  void showScreen('title');
}

start();
