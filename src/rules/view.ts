// それぞれの側から見える形への変換（相手の罠の場所・中身を隠す）
import type { CardInstance, GameEvent, GameState, Side } from './types';
import { cloneState } from './board';

export function viewFor(s: GameState, side: Side): GameState {
  const v = cloneState(s);
  for (const t of v.traps) {
    if (t.owner === side) continue;
    // 伏せたままの罠カードは「まだ使っていない」ように見せる。使用済みの印から中身が分かってしまうため
    const hiddenCard = t.cardId;
    if (hiddenCard) {
      const inst = v.players[t.owner].cards.find((c: CardInstance) => c.cardId === hiddenCard && c.used);
      if (inst) inst.used = false;
    }
    t.cardId = null;
    t.at = null;
  }
  return v;
}

export function filterEventsFor(events: GameEvent[], side: Side): GameEvent[] {
  return events.map(e => {
    if (e.type === 'trapSet' && e.side !== side) return { ...e, cardId: null, at: null };
    return e;
  });
}
