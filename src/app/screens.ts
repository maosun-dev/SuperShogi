// 画面の登録と切り替え（幕の演出つき）。各画面はここから registerScreen を読み込む。
// 起動処理は main.ts にあり、ここは起動に依存しない（循環 import を避ける）。

export type ScreenName = 'title' | 'level' | 'deck' | 'reveal' | 'match' | 'result' | 'zukan' | 'settings';
export interface Screen { mount(root: HTMLElement): void; unmount(): void }

const CURTAIN_MS = 450;
const REDUCED_MS = 120;

const makers = new Map<ScreenName, (params: unknown) => Screen>();
let current: Screen | null = null;
let root: HTMLElement | null = null;
let curtain: HTMLElement | null = null;
let busy: Promise<void> | null = null;
let clapper: () => void = () => {}; // 拍子木の音（main.ts が setClapper で効果音を差し込む。それまでは無音）
let hook: (name: ScreenName) => void = () => {}; // 画面を入れ替えたら呼ぶ（main.ts がバナー広告の出し入れを差し込む）

export function registerScreen(name: ScreenName, make: (params: unknown) => Screen): void {
  makers.set(name, make);
}

/** 拍子木の音を鳴らす関数を差し込む */
export function setClapper(fn: () => void): void {
  clapper = fn;
}

/** 画面を入れ替えたときに、新しい画面の名前で呼ぶ関数を差し込む（幕が閉じている間に呼ばれる） */
export function setScreenHook(fn: (name: ScreenName) => void): void {
  hook = fn;
}

/** 画面を置く場所と幕を用意する（起動時に1回） */
export function initScreens(rootEl: HTMLElement): void {
  root = rootEl;
  curtain = document.createElement('div');
  curtain.id = 'curtain';
  document.body.append(curtain);
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function swap(name: ScreenName, params: unknown): void {
  const make = makers.get(name);
  if (!make || !root) throw new Error(`画面が登録されていません: ${name}`);
  // 古い画面は先に片付け、current を空にしておく（作るのに失敗しても壊れた画面を指さない）
  const old = current;
  current = null;
  old?.unmount();
  root.replaceChildren();
  const next = make(params);
  try {
    next.mount(root);
  } catch (e) {
    try { next.unmount(); } catch { /* 片付けの失敗は無視 */ }
    root.replaceChildren();
    throw e;
  }
  current = next;
  try { hook(name); } catch { /* フックの失敗で画面の入れ替えを止めない */ }
}

/** 幕を引いて画面を入れ替える。引いている最中の呼び出しは、終わってから順に実行する */
export function showScreen(name: ScreenName, params?: unknown): Promise<void> {
  const run = async (): Promise<void> => {
    if (!root || !curtain) throw new Error('起動前に showScreen が呼ばれました');
    if (!makers.has(name)) throw new Error(`画面が登録されていません: ${name}`); // 幕を引く前に弾く
    if (current === null) {
      // 最初の1枚（や、前の入れ替えに失敗した後）は幕なしで出す
      swap(name, params);
      return;
    }
    const el = curtain;
    const reduced = reducedMotion();
    const half = (reduced ? REDUCED_MS : CURTAIN_MS) / 2;
    try {
      el.classList.add('run');
      clapper();
      const closing = reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }];
      const opening = reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }];
      const opt = { duration: half, easing: reduced ? 'linear' : 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' as const };
      await el.animate(closing, opt).finished;
      swap(name, params);
      await el.animate(opening, opt).finished;
    } finally {
      // 途中で例外が出ても、幕は必ず外して画面を操作できるようにする
      el.getAnimations().forEach((a) => a.cancel());
      el.classList.remove('run');
    }
  };
  const next = (busy ?? Promise.resolve()).then(run);
  busy = next.catch(() => {});
  return next;
}
