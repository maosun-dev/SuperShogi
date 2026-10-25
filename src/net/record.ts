// 友と対局：対局の中身は「最初の盤面を作る材料」と「手の記録」だけ。盤面はいつでも記録から作り直せる
import type { Action, CardId, GameState, Handicap, Side } from '../rules/types';
import { applyAction, createGame } from '../rules/game';
import type { KingFx } from '../fx/kingfx/kinds';

// kingFx は王を取る・取られる演出の案（誘った側が引いて、2台で同じ案を流す）
export interface Setup { decks: Record<Side, CardId[]>; handicap: Handicap; first: Side; kingFx: KingFx }

export function buildState(setup: Setup, log: readonly Action[]): GameState {
  let s = createGame(setup.decks, { handicap: setup.handicap, first: setup.first });
  for (const a of log) s = applyAction(s, a).state;
  return s;
}

/** seat の最後の手番が始まった記録の位置（その位置の手を指したのが seat）。一度も指していなければ null */
export function lastTurnStart(setup: Setup, log: readonly Action[], seat: Side): number | null {
  let s = createGame(setup.decks, { handicap: setup.handicap, first: setup.first });
  let found: number | null = null;
  let prev: Side | null = null;
  log.forEach((a, i) => {
    if (s.turn === seat && prev !== seat) found = i;
    prev = s.turn;
    s = applyAction(s, a).state;
  });
  return found;
}
