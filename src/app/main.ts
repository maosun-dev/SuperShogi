// 起動だけを受け持つ。画面の仕組みは screens.ts にある。
import '@fontsource/yuji-boku/400.css';
import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/800.css';
import './style.css';
import {
  ALL_SCREENS, SCREEN_LABEL, hasScreen, initScreens, registerScreen, showScreen,
  setClapper, type Screen, type ScreenName,
} from './screens';
import { getSound } from '../fx/sound';
import { loadSettings, safeStore } from './storage';
import { zukanScreen } from './screens/zukan';
import { titleScreen } from './screens/title';
import { matchScreen } from './screens/match';
import { resultScreen } from './screens/result';
import { fxMatchParams } from './dev';

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
  // 効果音：音量は設定から。音は最初の操作のあとに鳴らし始める（それまでは無音）。幕の拍子木もここで差し込む
  const sound = getSound();
  sound.setVolume(loadSettings(safeStore()).volume);
  setClapper(() => sound.play('hyoshigi'));
  const unlock = (): void => sound.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  registerScreen('title', () => titleScreen());
  registerScreen('zukan', () => zukanScreen());
  registerScreen('match', (p) => matchScreen(p));
  registerScreen('result', (p) => resultScreen(p));
  for (const n of ALL_SCREENS) {
    if (!hasScreen(n)) registerScreen(n, () => placeholder(n));
  }
  // 開発中に ?fx=<カード> が付いていれば、演出の試し口として対局画面から始める
  const fx = fxMatchParams();
  void (fx ? showScreen('match', fx) : showScreen('title'));
}

start();
