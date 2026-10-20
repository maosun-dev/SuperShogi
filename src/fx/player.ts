// 演出役（Presenter の本体）。今は「動いた駒・打った駒を 160ms で動かして sync」だけ。
// カード・罠・決着の演出は後のタスクでここに足す。
// 決まり：present は決して reject しない。失敗は中で握って console.error し、最後に必ず sync して resolve する。
import type { Side } from '../rules/types';
import type { Presenter, Step } from '../app/match';
import type { Stage } from '../view/stage';
import type { Hud } from '../view/hud';
import { easeOut } from '../view/stage';
import { squarePos } from '../view/board3d';
import { pieceMesh, sync } from '../view/pieces3d';

const MOVE_MS = 160;   // 普段の駒の移動
const HOP = 0.18;      // 動くときに少し浮かせる高さ
const DROP_FROM = 0.7; // 打つ駒が降りてくる高さ

async function play(stage: Stage, step: Step, me: Side): Promise<void> {
  // 盤の上の駒を動かす（韋駄天の2回目も順に）
  for (const e of step.events) {
    if (e.type !== 'moved') continue;
    const m = pieceMesh(e.pieceId);
    if (!m) continue;
    const a = squarePos(e.from), b = squarePos(e.to), y0 = m.position.y;
    await stage.tween(MOVE_MS, (t) => {
      m.position.set(a.x + (b.x - a.x) * t, y0 + Math.sin(Math.PI * t) * HOP, a.z + (b.z - a.z) * t);
    }, easeOut);
  }
  // 打った駒は局面を揃えてから、上から降ろす
  const drops = step.events.filter(e => e.type === 'dropped');
  if (drops.length === 0) return;
  sync(stage, step.after, me);
  for (const e of drops) {
    const m = pieceMesh(e.pieceId);
    if (!m) continue;
    const y0 = m.position.y;
    await stage.tween(MOVE_MS, (t) => { m.position.y = y0 + (1 - t) * DROP_FROM; }, easeOut);
  }
}

export function createPresenter(stage: Stage, hud: Hud, me: Side): Presenter {
  void hud; // カードの札が飛ぶ演出などで使う（後のタスク）
  return {
    async present(step) {
      try {
        await play(stage, step, me);
      } catch (e) {
        console.error('演出に失敗しました', e);
      } finally {
        try { sync(stage, step.after, me); } catch (e) { console.error('盤を揃えられませんでした', e); }
      }
    },
  };
}
