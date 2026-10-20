// 装備カード4枚
import type { CardId, GameState, Side, Square } from '../rules/types';
import { idx, sqOf } from '../rules/board';
import type { CardContext, CardDef } from './types';

// 装備が付いていない自分の駒1つ
function bareOwnPieces(s: GameState, side: Side): Square[][] {
  const out: Square[][] = [];
  s.board.forEach((p, i) => {
    if (p && p.side === side && !p.equip) out.push([sqOf(i)]);
  });
  return out;
}

function attach(cardId: CardId) {
  return (ctx: CardContext, [sq]: Square[]) => {
    const p = ctx.state.board[idx(sq)]!;
    p.equip = { cardId };
    ctx.emit({ type: 'equipped', pieceId: p.id, cardId });
  };
}

export const tenma: CardDef = {
  id: 'tenma', name: '天馬の蹄', kind: 'equip', cost: 2, fx: 'tenma',
  text: '付けた駒が、桂馬の動きも使えるようになる',
  targetSets: bareOwnPieces,
  resolve: attach('tenma'),
  equip: { knight: true },
};

export const hagane: CardDef = {
  id: 'hagane', name: '鋼の鎧', kind: 'equip', cost: 3, fx: 'hagane',
  text: '付けた駒が取られそうになったとき、1回だけ守る。取ろうとした駒は元のマスに戻り、相手の手番は終わる。魔法や罠からは守らない',
  targetSets: bareOwnPieces,
  resolve: attach('hagane'),
  equip: { armor: true },
};

export const tate: CardDef = {
  id: 'tate', name: '王の盾', kind: 'equip', cost: 4, fx: 'tate',
  text: '付けた駒と、その周り8マスの味方の駒は、相手の魔法を受けない',
  targetSets: bareOwnPieces,
  resolve: attach('tate'),
  equip: { magicShield: true },
};

export const idaten: CardDef = {
  id: 'idaten', name: '韋駄天', kind: 'equip', cost: 5, fx: 'idaten',
  text: '付けた駒は、1手で2回動ける。2回目の移動はしなくてもよい。2回目の移動では駒を取れない',
  targetSets: bareOwnPieces,
  resolve: attach('idaten'),
  equip: { doubleMove: true },
};

export const EQUIP_CARDS: CardDef[] = [tenma, hagane, tate, idaten];
