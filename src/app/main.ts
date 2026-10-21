// 起動だけを受け持つ。画面の仕組みは screens.ts にある。
import '@fontsource/yuji-boku/400.css';
import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/800.css';
import './style.css';
import { initScreens, registerScreen, showScreen, setClapper } from './screens';
import { getSound } from '../fx/sound';
import { loadSettings, safeStore } from './storage';
import { zukanScreen } from './screens/zukan';
import { titleScreen } from './screens/title';
import { matchScreen } from './screens/match';
import { resultScreen } from './screens/result';
import { levelScreen } from './screens/level';
import { deckScreen } from './screens/deck';
import { revealScreen } from './screens/reveal';
import { settingsScreen } from './screens/settings';
import { prepareSaves } from './native';
import { autoMatchParams, fxMatchParams } from './dev';

function start(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app がありません');
  initScreens(root);
  // 効果音：音量は設定から。音は最初の操作のあとに鳴らし始める（それまでは無音）。幕の拍子木もここで差し込む
  const sound = getSound();
  sound.setVolume(loadSettings(safeStore()).volume);
  setClapper(() => sound.play('hyoshigi'));
  // iOS Safari は touchend / click でしか再開を許さないことがあるので、4種類すべてで試す。音が出せるようになったら外す
  const kinds = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
  const unlock = (): void => {
    sound.unlock();
    if (sound.running()) for (const k of kinds) window.removeEventListener(k, unlock, { capture: true });
  };
  for (const k of kinds) window.addEventListener(k, unlock, { capture: true });
  registerScreen('title', () => titleScreen());
  registerScreen('zukan', () => zukanScreen());
  registerScreen('match', (p) => matchScreen(p));
  registerScreen('result', (p) => resultScreen(p));
  registerScreen('level', () => levelScreen());
  registerScreen('deck', (p) => deckScreen(p));
  registerScreen('reveal', (p) => revealScreen(p));
  registerScreen('settings', () => settingsScreen());
  // 開発中に ?fx=<カード> が付いていれば演出の試し口として、?auto=<強さ> なら自動対局として、対局画面から始める
  const dev = fxMatchParams() ?? autoMatchParams();
  // アプリでは保存を戻し終わってから最初の画面を出す（失敗しても画面は出す）
  void prepareSaves().catch(() => { /* 戻せなくても始める */ }).then(() => {
    sound.setVolume(loadSettings(safeStore()).volume); // 戻した設定の音量を反映
    return dev ? showScreen('match', dev) : showScreen('title');
  });
}

start();
