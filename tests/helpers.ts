// テスト用：空の盤に駒を置いて局面を作る
import type { CardId, GameState, Piece, PieceKind, Side, Square } from '../src/rules/types';
import { emptyHand, idx } from '../src/rules/board';

export function emptyState(turn: Side = 'sente'): GameState {
  return {
    board: new Array(81).fill(null),
    players: {
      sente: { hand: emptyHand(), cards: [] },
      gote: { hand: emptyHand(), cards: [] },
    },
    traps: [],
    turn,
    ply: 0,
    frozen: null,
    seen: {},
    result: null,
    nextId: 1,
  };
}

export function put(
  s: GameState, sq: Square, kind: PieceKind, side: Side,
  opts: { promoted?: boolean; equip?: CardId } = {},
): Piece {
  const p: Piece = {
    id: s.nextId++, kind, side,
    promoted: opts.promoted ?? false,
    equip: opts.equip ? { cardId: opts.equip } : null,
  };
  s.board[idx(sq)] = p;
  return p;
}

// side の手札にカードを1枚足し、その uid を返す
export function giveCard(s: GameState, side: Side, cardId: CardId): number {
  const uid = s.nextId++;
  s.players[side].cards.push({ uid, cardId, used: false });
  return uid;
}
