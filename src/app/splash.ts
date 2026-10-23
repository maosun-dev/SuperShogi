// 起動時の画面：開発者「maosun-dev」のしるし。開発者サイト（maosun-dev.com）のロゴは麻雀の牌に1字ずつ書いて
// 「dev」を上の段、「maosun」を下の段に積んだ形。ここでは牌を将棋の駒に置き換え、木の盤に1枚ずつ「パチン」と打つ。
// 字の書体と色の順（朱・緑・藍）はサイトに合わせる。飛ばせない（押しても何も起きない）。
// 地の色は iPhone が起動の一瞬に出す無地の画面（夜の藍）と同じにして、切り替わりでチカッとさせない。
import type { Sound } from '../fx/sound';

/** 打つ順（下の段 maosun → 上の段 dev）と、置くマス（列・段。上の段はサイトと同じく右へずらす） */
export const SPLASH_PIECES: readonly { ch: string; col: number; row: 0 | 1 }[] = [
  ...[...'maosun'].map((ch, i) => ({ ch, col: i, row: 1 as const })),
  ...[...'dev'].map((ch, i) => ({ ch, col: i + 3, row: 0 as const })),
];

const STEP_MS = 140;   // 1枚ごとの間
const LAND_MS = 220;   // 1枚が落ちて止まるまで
const HOLD_MS = 800;   // 打ち終わってから止める時間
const LEAVE_MS = 450;  // 消えていく時間
const COLORS = ['#c8323a', '#1f7a50', '#22365e']; // サイトと同じ朱・緑・藍（字の順に回す）

export interface Splash {
  /** 打ち終わって、止める時間も済んだら解決する */
  done: Promise<void>;
  /** 画面から消す（消え終わったら解決） */
  leave(): Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 起動の画面を出して、駒を打ち始める */
export function playSplash(sound: Sound, reduced: boolean): Splash {
  const box = document.createElement('div');
  box.id = 'splash';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', 'maosun-dev');
  const board = document.createElement('div');
  board.className = 'sp-board';
  const pieces = SPLASH_PIECES.map((p, i) => {
    const k = document.createElement('i');
    k.className = 'sp-koma';
    k.textContent = p.ch;
    k.style.setProperty('--col', String(p.col));
    k.style.setProperty('--row', String(p.row));
    k.style.color = COLORS[i % COLORS.length];
    board.append(k);
    return k;
  });
  box.append(board);
  document.body.append(box);
  document.getElementById('boot-cover')?.remove(); // 起動の画面が出たので、起動の覆いはいらない

  const done = (async () => {
    // 字の書体が届くのを少しだけ待つ（届かなくても打ち始める）
    try {
      await Promise.race([document.fonts.load('400 40px "Dela Gothic One"', 'maosundev'), wait(800)]);
    } catch { /* 待てなくても進む */ }
    sound.unlock(); // アプリ版は押さなくても音を出せる（ブラウザでは鳴らないことがある）
    for (const k of pieces) {
      k.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
            { opacity: 0, transform: 'translateY(-26px) scale(1.35) rotate(-6deg)' },
            { opacity: 1, offset: 0.55, transform: 'translateY(2px) scale(.96) rotate(0deg)' },
            { opacity: 1, transform: 'none' },
          ],
        { duration: LAND_MS, easing: 'cubic-bezier(.3,0,.5,1)', fill: 'forwards' },
      );
      setTimeout(() => sound.play('koma'), reduced ? 0 : LAND_MS * 0.55);
      await wait(STEP_MS);
    }
    await wait(LAND_MS + HOLD_MS);
  })();

  return {
    done,
    async leave() {
      try {
        await box.animate(
          reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.06)' }],
          { duration: LEAVE_MS, easing: 'ease-in', fill: 'forwards' },
        ).finished;
      } catch { /* 消えなくても片付ける */ }
      box.remove();
    },
  };
}
