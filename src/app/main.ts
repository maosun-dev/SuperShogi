// 起動だけを受け持つ。画面の仕組みは screens.ts にある。
import '@fontsource/yuji-boku/400.css';
import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/800.css';
import './style.css';
import { initScreens, registerScreen, showScreen, setClapper, setScreenHook } from './screens';
import { getSound } from '../fx/sound';
import { loadSettings, safeStore } from './storage';
import { applyStage, effectiveMotion, onStageChange, prefersReducedMotion } from './stageTheme';
import { mountBackdrop } from '../view/backdrop';
import { mountAmbient } from '../view/ambient';
import { setStageLook } from '../view/stageFloor';
import { getStage } from '../view/stage';
import { zukanScreen } from './screens/zukan';
import { titleScreen } from './screens/title';
import { matchScreen } from './screens/match';
import { resultScreen } from './screens/result';
import { levelScreen } from './screens/level';
import { deckScreen } from './screens/deck';
import { revealScreen } from './screens/reveal';
import { settingsScreen } from './screens/settings';
import { armSoundUnlock, watchResume } from './unlock';
import { prepareSaves } from './native';
import { autoMatchParams, fxMatchParams } from './dev';
import { bannerOn, initAds, setBannerWanted } from './ads';

function start(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app がありません');
  initScreens(root);
  // バナー広告（アプリ版だけ）：対局の外の画面で出し、対局では隠す
  initAds();
  setScreenHook((name) => setBannerWanted(bannerOn(name)));
  // 効果音：音量は設定から。音は最初の操作のあとに鳴らし始める（それまでは無音）。幕の拍子木もここで差し込む
  const settings = loadSettings(safeStore());
  // 舞台（背景と色の決まり）を最初に決める
  applyStage(document.documentElement, settings);
  const motion = effectiveMotion(settings.motion, prefersReducedMotion());
  // 奥から：背景の絵（層0）→ 動く飾り（層1）→ #app（盤の3Dと文字）
  const ambient = mountAmbient(document.body, settings.stage, motion);
  const backdrop = mountBackdrop(document.body, settings.stage, motion);
  setStageLook(getStage(), settings.stage);
  onStageChange((stage, m) => {
    backdrop.setStage(stage); backdrop.setMotion(m);
    ambient.setStage(stage); ambient.setMotion(m);
    setStageLook(getStage(), stage);
  });
  const sound = getSound();
  sound.setVolume(settings.volume);
  setClapper(() => sound.play('hyoshigi'));
  // 最初の操作で解錠し、裏から戻って止まっていたら付け直す
  armSoundUnlock(sound, window);
  watchResume(sound, window, document);
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
