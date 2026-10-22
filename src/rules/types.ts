// 超将棋のルールで使う型

export type Side = 'sente' | 'gote';
export type PieceKind = 'FU' | 'KY' | 'KE' | 'GI' | 'KI' | 'KA' | 'HI' | 'OU';
export type HandKind = Exclude<PieceKind, 'OU'>;
export type CardId =
  | 'oshikaeshi' | 'irekae' | 'rakurai' | 'itetsuku' | 'yobimodoshi'
  | 'otoshiana' | 'kagami' | 'narifuuji'
  | 'tenma' | 'hagane' | 'hikijin' | 'idaten'
  | 'kakuotoshi' | 'shoryu' | 'aiuchi' | 'migawari' | 'tsuranuki' | 'omori';

// c は先手から見て左が0・右が8、r は上（後手側）が0・下（先手側）が8
export interface Square { c: number; r: number }
export interface Equip { cardId: CardId }
// frozen：凍って動けない残りの手番（無いときは凍っていない）。sealed：成り封じを受け、対局の終わりまで成れない
export interface Piece {
  id: number; kind: PieceKind; side: Side; promoted: boolean; equip: Equip | null;
  frozen?: number; sealed?: true;
}
export interface CardInstance { uid: number; cardId: CardId; used: boolean }
// 伏せた罠。cardId / at が null なのは「相手から見て隠されている」状態
export interface SetTrap { uid: number; owner: Side; cardId: CardId | null; at: Square | null }
export interface PlayerState { hand: Record<HandKind, number>; cards: CardInstance[] }
export type HandicapKind = 'none' | 'kyo' | 'kaku' | 'hisha' | 'hikyo' | 'nimai' | 'yonmai' | 'rokumai';
export interface Handicap { side: Side; kind: HandicapKind }
export type Result =
  | { winner: Side; reason: 'king-captured' }
  | { winner: null; reason: 'repetition' | 'move-limit' };

export interface GameState {
  board: (Piece | null)[];   // board[r * 9 + c]
  players: Record<Side, PlayerState>;
  traps: SetTrap[];
  turn: Side;
  ply: number;
  trapSetThisTurn: boolean;  // この手番に忍札を伏せたか（伏せても手番は終わらない。1手番1枚まで）
  seen: Record<string, number>;
  result: Result | null;
  nextId: number;
}

export type Action =
  | { type: 'move'; from: Square; to: Square; promote: boolean; second?: { to: Square; promote: boolean } }
  | { type: 'drop'; kind: HandKind; to: Square }
  | { type: 'card'; uid: number; targets: Square[]; pick?: HandKind };

export type GameEvent =
  | { type: 'moved'; pieceId: number; from: Square; to: Square; promoted: boolean }
  | { type: 'dropped'; pieceId: number; side: Side; kind: HandKind; to: Square }
  | { type: 'captured'; pieceId: number; at: Square; by: Side }
  | { type: 'cardUsed'; side: Side; cardId: CardId; targets: Square[] }
  | { type: 'trapSet'; side: Side; uid: number; cardId: CardId | null; at: Square | null }
  | { type: 'trapTriggered'; owner: Side; uid: number; cardId: CardId; at: Square | null }
  | { type: 'destroyed'; pieceId: number; at: Square; cause: CardId }
  | { type: 'pushed'; pieceId: number; from: Square; to: Square }
  | { type: 'swapped'; a: Square; b: Square }
  | { type: 'equipped'; pieceId: number; cardId: CardId }
  | { type: 'armorBlocked'; defenderId: number; attackerId: number; at: Square }
  | { type: 'promotionBlocked'; pieceId: number }
  | { type: 'magicNegated'; side: Side; cardId: CardId }
  | { type: 'handTransferred'; kind: HandKind; from: Side; to: Side }
  | { type: 'frozen'; pieceId: number; at: Square; turns: number }
  | { type: 'demoted'; pieceId: number; at: Square }
  | { type: 'promotedInPlace'; pieceId: number; at: Square }
  | { type: 'kingGuarded'; attackerId: number; kingId: number; at: Square }
  | { type: 'secondMoveSkipped'; pieceId: number }
  | { type: 'passed'; side: Side }     // 指せる行動がなく、手番が自動で回った

  | { type: 'check'; side: Side }      // side の王が狙われている
  | { type: 'gameOver'; result: Result };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
