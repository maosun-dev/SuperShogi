// 起動だけを受け持つ。画面の仕組みは screens.ts にある。
import '@fontsource/yuji-boku/400.css';
import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/800.css';
import '@fontsource/dela-gothic-one/latin-400.css'; // 起動時の画面の字（サイトのロゴと同じ書体。英字だけ）
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
import { linkScreen } from './screens/link';
import { friendScreen } from './screens/friend';
import { gcLinkScreen } from './screens/gclink';
import { howtoScreen } from './screens/howto';
import { armSoundUnlock, watchAppLife } from './unlock';
import { appLife } from './appLife';
import { soundLog } from '../fx/soundLog';
import { prepareSaves } from './native';
import { autoMatchParams, fxMatchParams } from './dev';
import { bannerOn, initAds, setBannerWanted } from './ads';
import { playSplash } from './splash';
import { musicFor, pickMatchTrack } from './music';

function start(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app がありません');
  initScreens(root);
  // バナー広告（アプリ版だけ）：対局の外の画面で出し、対局では隠す。広告を動かし始める（initAds）のは起動の画面のあと
  // 曲：画面に合わせて流す・止める（幕が閉じている間に切り替わる）
  // 起動の画面（maosun-dev のしるし）を出している間は曲を流さず、消えてから流す
  let splashing = true;
  let pendingMusic: ReturnType<typeof musicFor> = null;
  setScreenHook((name) => {
    setBannerWanted(bannerOn(name));
    // 対局の曲は対局の画面を開くたびに設定から決める（おまかせなら毎局引き直す）
    const track = name === 'match' ? pickMatchTrack(loadSettings(safeStore()).bgm, Math.random()) : undefined;
    const music = musicFor(name, track);
    if (splashing) { pendingMusic = music; return; }
    getSound().music(music);
  });
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
  // 幕の音：ふだんは拍子木、決着から結果画面へは歌舞伎の垂れ幕
  setClapper((to) => sound.play(to === 'result' ? 'maku' : 'hyoshigi'));
  // 最初の操作で解錠する。裏に回ったら曲ごと音を止め、表に戻って止まっていたら付け直す
  armSoundUnlock(sound, window);
  const life = appLife();
  watchAppLife(sound, window, life);
  // 調べる用：表に戻った直後と1秒後の音の仕組みの状態（時計が進んでいなければ固まっている）
  life.onActive(() => {
    soundLog(`戻った直後 ${sound.state()}`);
    window.setTimeout(() => soundLog(`1秒後 ${sound.state()}`), 1000);
  });
  registerScreen('title', () => titleScreen());
  registerScreen('zukan', () => zukanScreen());
  registerScreen('match', (p) => matchScreen(p));
  registerScreen('result', (p) => resultScreen(p));
  registerScreen('level', () => levelScreen());
  registerScreen('deck', (p) => deckScreen(p));
  registerScreen('reveal', (p) => revealScreen(p));
  registerScreen('settings', () => settingsScreen());
  registerScreen('link', (p) => linkScreen(p));
  registerScreen('friend', () => friendScreen());
  registerScreen('gclink', (p) => gcLinkScreen(p));
  registerScreen('howto', () => howtoScreen());
  // 開発中に ?fx=<カード> が付いていれば演出の試し口として、?auto=<強さ> なら自動対局として、対局画面から始める
  const dev = fxMatchParams() ?? autoMatchParams();
  // 起動の画面（maosun-dev のしるし）。開発の試し口・自動対局では出さない
  const splash = dev ? null : playSplash(sound, prefersReducedMotion());
  // アプリでは保存を戻し終わってから最初の画面を出す（失敗しても画面は出す）。
  // 最初の画面は起動の画面のうしろで先に組み立てておき、打ち終わったら起動の画面を消す。
  // 追跡の確認と広告は、起動の画面が消えてから（ロゴの上にかぶせない）
  void prepareSaves().catch(() => { /* 戻せなくても始める */ }).then(async () => {
    sound.setVolume(loadSettings(safeStore()).volume); // 戻した設定の音量を反映
    try {
      await (dev ? showScreen('match', dev) : showScreen('title'));
    } finally {
      // 最初の画面の組み立てに失敗しても、起動の画面は必ず消す（押せないまま止まらないように）
      if (splash) {
        await splash.done;
        await splash.leave();
      }
      document.getElementById('boot-cover')?.remove(); // 起動の画面を出さないとき（開発の試し口）の分
      splashing = false;
      sound.music(pendingMusic);
      initAds();
    }
  });
}

start();
