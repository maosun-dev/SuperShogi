// マス目の計算・初期配置・局面の複製・局面のキー
import type { GameState, Piece, PieceKind, Side, Square, HandKind } from './types';

export const HAND_KINDS: HandKind[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];

export function idx(sq: Square): number {
  return sq.r * 9 + sq.c;
}

export function sqOf(i: number): Square {
  return { c: i % 9, r: Math.floor(i / 9) };
}

export function onBoard(sq: Square): boolean {
  return sq.c >= 0 && sq.c < 9 && sq.r >= 0 && sq.r < 9;
}

export function sameSq(a: Square, b: Square): boolean {
  return a.c === b.c && a.r === b.r;
}

export function opponent(side: Side): Side {
  return side === 'sente' ? 'gote' : 'sente';
}

// 先手は r が減る向き、後手は r が増える向きに進む
export function forward(side: Side): -1 | 1 {
  return side === 'sente' ? -1 : 1;
}

export function emptyHand(): Record<HandKind, number> {
  return { HI: 0, KA: 0, KI: 0, GI: 0, KE: 0, KY: 0, FU: 0 };
}

// 平手の初期配置
export function initialBoard(): { board: (Piece | null)[]; nextId: number } {
  const board: (Piece | null)[] = new Array(81).fill(null);
  let nextId = 1;
  const back: PieceKind[] = ['KY', 'KE', 'GI', 'KI', 'OU', 'KI', 'GI', 'KE', 'KY'];
  const place = (c: number, r: number, kind: PieceKind, side: Side) => {
    board[idx({ c, r })] = { id: nextId++, kind, side, promoted: false, equip: null };
  };
  for (let c = 0; c < 9; c++) {
    place(c, 0, back[c], 'gote');
    place(c, 8, back[c], 'sente');
    place(c, 2, 'FU', 'gote');
    place(c, 6, 'FU', 'sente');
  }
  place(1, 1, 'HI', 'gote');
  place(7, 1, 'KA', 'gote');
  place(7, 7, 'HI', 'sente');
  place(1, 7, 'KA', 'sente');
  return { board, nextId };
}

// 深い複製（局面は JSON で表せる値だけでできている）
export function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

// 同じ局面かどうかを見分けるキー
export function positionKey(s: GameState): string {
  const cells = s.board.map(p => {
    if (!p) return '.';
    return `${p.side[0]}${p.kind}${p.promoted ? '+' : ''}${p.equip ? '@' + p.equip.cardId : ''}`;
  });
  const hands = (['sente', 'gote'] as Side[]).map(side =>
    HAND_KINDS.map(k => s.players[side].hand[k]).join(','));
  // 使ったカードは枚数だけ数える。どのカードかを入れると、伏せた罠の中身が千日手の記録から分かってしまう。
  // 中身の見える罠の分を引いておくと、viewFor した局面（伏せた罠のカードを未使用に見せる）とキーがそろう
  const used = (['sente', 'gote'] as Side[]).map(side =>
    s.players[side].cards.filter(c => c.used).length
    - s.traps.filter(t => t.owner === side && t.cardId !== null).length);
  const traps = (['sente', 'gote'] as Side[]).map(side =>
    s.traps.filter(t => t.owner === side).length);
  return [cells.join(''), hands.join('|'), s.turn, used.join('|'), traps.join(','), s.frozen ?? '-'].join('/');
}
