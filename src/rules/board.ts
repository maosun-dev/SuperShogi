// マス目の計算・初期配置・局面の複製・局面のキー
import type { GameState, Handicap, HandicapKind, Piece, PieceKind, Side, Square, HandKind } from './types';

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

export const HANDICAP_LABEL: Record<HandicapKind, string> = {
  none: 'なし', kyo: '香落ち', kaku: '角落ち', hisha: '飛車落ち', hikyo: '飛香落ち',
  nimai: '二枚落ち', yonmai: '四枚落ち', rokumai: '六枚落ち',
};

// 落とす駒のマス（先手の向きで書く。c は先手から見て左が0）。香落ちの香は落とす側から見て左
const HANDICAP_SQUARES: Record<HandicapKind, Square[]> = {
  none: [],
  kyo: [{ c: 0, r: 8 }],
  kaku: [{ c: 1, r: 7 }],
  hisha: [{ c: 7, r: 7 }],
  hikyo: [{ c: 7, r: 7 }, { c: 0, r: 8 }],
  nimai: [{ c: 7, r: 7 }, { c: 1, r: 7 }],
  yonmai: [{ c: 7, r: 7 }, { c: 1, r: 7 }, { c: 0, r: 8 }, { c: 8, r: 8 }],
  rokumai: [{ c: 7, r: 7 }, { c: 1, r: 7 }, { c: 0, r: 8 }, { c: 8, r: 8 }, { c: 1, r: 8 }, { c: 7, r: 8 }],
};

// 平手の盤から、駒落ちの駒を取り除く（後手は盤を180度回したマス）
export function applyHandicap(board: (Piece | null)[], h: Handicap): void {
  for (const sq of HANDICAP_SQUARES[h.kind]) {
    const at = h.side === 'sente' ? sq : { c: 8 - sq.c, r: 8 - sq.r };
    board[idx(at)] = null;
  }
}

function clonePiece(p: Piece): Piece {
  const q: Piece = { id: p.id, kind: p.kind, side: p.side, promoted: p.promoted, equip: p.equip ? { ...p.equip } : null };
  if (p.frozen) q.frozen = p.frozen;
  if (p.sealed) q.sealed = true;
  if (p.shackle) q.shackle = { left: p.shackle.left };
  if (p.numb) q.numb = p.numb;
  if (p.reach) q.reach = p.reach;
  return q;
}

// 深い複製。CPU の読みで何度も呼ぶので、JSON を通さず1段ずつ写す
export function cloneState(s: GameState): GameState {
  const players = {} as GameState['players'];
  for (const side of ['sente', 'gote'] as Side[]) {
    const pl = s.players[side];
    players[side] = { hand: { ...pl.hand }, cards: pl.cards.map(c => ({ uid: c.uid, cardId: c.cardId, used: c.used })) };
  }
  return {
    board: s.board.map(p => (p ? clonePiece(p) : null)),
    players,
    traps: s.traps.map(t => ({ uid: t.uid, owner: t.owner, cardId: t.cardId, at: t.at ? { c: t.at.c, r: t.at.r } : null })),
    turn: s.turn,
    ply: s.ply,
    trapSetThisTurn: s.trapSetThisTurn,
    pushFollowUp: s.pushFollowUp,
    seen: { ...s.seen },
    result: s.result ? { ...s.result } : null,
    nextId: s.nextId,
  };
}

// 同じ局面かどうかを見分けるキー
// 形：盤81マス / 先手の持ち駒,…|後手の持ち駒,… / 手番 / 使った札の数 先手|後手 / 伏せた罠の数 先手,後手 / T- / P-
// CPU の読みで何度も呼ぶので、配列を作らず1つの文字列をつないで作る
export function positionKey(s: GameState): string {
  let key = '';
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p) { key += '.'; continue; }
    key += (p.side === 'sente' ? 's' : 'g') + p.kind;
    if (p.promoted) key += '+';
    if (p.equip) key += '@' + p.equip.cardId;
    if (p.shackle) key += '#' + p.shackle.left;
    if (p.frozen) key += '~' + p.frozen;
    if (p.sealed) key += '!';
  }
  const sh = s.players.sente.hand, gh = s.players.gote.hand;
  key += `/${sh.HI},${sh.KA},${sh.KI},${sh.GI},${sh.KE},${sh.KY},${sh.FU}|${gh.HI},${gh.KA},${gh.KI},${gh.GI},${gh.KE},${gh.KY},${gh.FU}/${s.turn}/`;
  // 使ったカードは枚数だけ数える。どのカードかを入れると、伏せた罠の中身が千日手の記録から分かってしまう。
  // 中身の見える罠の分を引いておくと、viewFor した局面（伏せた罠のカードを未使用に見せる）とキーがそろう
  let usedS = 0, usedG = 0, trapS = 0, trapG = 0;
  for (const c of s.players.sente.cards) if (c.used) usedS++;
  for (const c of s.players.gote.cards) if (c.used) usedG++;
  for (const t of s.traps) {
    if (t.owner === 'sente') { trapS++; if (t.cardId !== null) usedS--; } else { trapG++; if (t.cardId !== null) usedG--; }
  }
  return key + `${usedS}|${usedG}/${trapS},${trapG}/${s.trapSetThisTurn ? 'T' : '-'}/${s.pushFollowUp ? 'P' : '-'}`;
}
