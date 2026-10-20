import '@fontsource/yuji-boku/400.css';
import '@fontsource/shippori-mincho-b1/500.css';
import '@fontsource/shippori-mincho-b1/800.css';
import './style.css';

export type ScreenName = 'title' | 'level' | 'deck' | 'reveal' | 'match' | 'result' | 'zukan' | 'settings';
export interface Screen { mount(root: HTMLElement): void; unmount(): void }

const ALL_SCREENS: ScreenName[] = ['title', 'level', 'deck', 'reveal', 'match', 'result', 'zukan', 'settings'];
const SCREEN_LABEL: Record<ScreenName, string> = {
  title: 'タイトル', level: '強さ選び', deck: 'カード選び', reveal: '札見せ',
  match: '対局', result: '結果', zukan: 'カード図鑑', settings: '設定',
};

const CURTAIN_MS = 450;
const REDUCED_MS = 120;

const makers = new Map<ScreenName, (params: unknown) => Screen>();
let current: Screen | null = null;
let root: HTMLElement | null = null;
let curtain: HTMLElement | null = null;
let busy: Promise<void> | null = null;
let clapper: () => void = () => {}; // 拍子木の音（タスク12で差し替える。今は無音）

export function registerScreen(name: ScreenName, make: (params: unknown) => Screen): void {
  makers.set(name, make);
}

/** 拍子木の音を鳴らす関数を差し込む */
export function setClapper(fn: () => void): void {
  clapper = fn;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function swap(name: ScreenName, params: unknown): void {
  const make = makers.get(name);
  if (!make || !root) throw new Error(`画面が登録されていません: ${name}`);
  current?.unmount();
  root.replaceChildren();
  current = make(params);
  current.mount(root);
}

/** 幕を引いて画面を入れ替える。引いている最中の呼び出しは、終わってから順に実行する */
export function showScreen(name: ScreenName, params?: unknown): Promise<void> {
  const run = async (): Promise<void> => {
    if (!root) throw new Error('起動前に showScreen が呼ばれました');
    if (!curtain || current === null) {
      // 最初の1枚は幕なしで出す
      swap(name, params);
      return;
    }
    const reduced = reducedMotion();
    const total = reduced ? REDUCED_MS : CURTAIN_MS;
    curtain.classList.add('run');
    clapper();
    const closing = reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }];
    const opening = reduced
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }];
    const opt = { duration: total / 2, easing: reduced ? 'linear' : 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' as const };
    await curtain.animate(closing, opt).finished;
    swap(name, params);
    await curtain.animate(opening, opt).finished;
    curtain.getAnimations().forEach((a) => a.cancel());
    curtain.classList.remove('run');
  };
  const next = (busy ?? Promise.resolve()).then(run);
  busy = next.catch(() => {});
  return next;
}

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

export function start(): void {
  root = document.getElementById('app');
  if (!root) throw new Error('#app がありません');
  curtain = document.createElement('div');
  curtain.id = 'curtain';
  document.body.append(curtain);
  for (const n of ALL_SCREENS) {
    if (!makers.has(n)) registerScreen(n, () => placeholder(n));
  }
  void showScreen('title');
}

start();
