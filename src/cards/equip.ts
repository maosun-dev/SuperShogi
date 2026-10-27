// 纏札6枚（2026-10：貫きの槍をなくし番傘を足した。退き陣の旗は陣替えの旗に）
import type { CardId, GameState, Piece, Side, Square } from '../rules/types';
import { idx, opponent, sqOf } from '../rules/board';
import type { CardContext, CardDef } from './types';

// 纏札が付いていない side の駒のうち、ok を満たすもの
function barePieces(s: GameState, side: Side, ok: (p: Piece, sq: Square) => boolean = () => true): Square[][] {
  const out: Square[][] = [];
  s.board.forEach((p, i) => {
    if (p && p.side === side && !p.equip && ok(p, sqOf(i))) out.push([sqOf(i)]);
  });
  return out;
}

function bareOwnPieces(s: GameState, side: Side): Square[][] {
  return barePieces(s, side);
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
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: bareOwnPieces,
  resolve: attach('tenma'),
  equip: { knight: true },
};

export const hagane: CardDef = {
  id: 'hagane', name: '鋼の鎧', kind: 'equip', cost: 3, fx: 'hagane',
  text: '付けた駒が取られそうになったとき、1回だけ守る。取ろうとした駒は元のマスに戻り、相手の手番は終わる。術札や忍札からは守らない。王には付けられない',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p => p.kind !== 'OU'),
  resolve: attach('hagane'),
  equip: { armor: true },
};

export const hikijin: CardDef = {
  id: 'hikijin', name: '陣替えの旗', kind: 'equip', cost: 2, fx: 'hikijin',
  text: '自分のまだ成っていない歩・香車・桂馬・銀に付ける。付けた駒は、真後ろと左右へ1マス動ける',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p =>
    !p.promoted && (p.kind === 'FU' || p.kind === 'KY' || p.kind === 'KE' || p.kind === 'GI')),
  resolve: attach('hikijin'),
  equip: { retreat: true },
};

export const idaten: CardDef = {
  id: 'idaten', name: '韋駄天', kind: 'equip', cost: 4, fx: 'idaten',
  text: '飛車・角（竜・馬も）以外の自分の駒に付ける。付けた駒は、1手で2回動ける。2回目の移動はしなくてもよい。2回目の移動では駒を取れない',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p => p.kind !== 'HI' && p.kind !== 'KA'),
  resolve: attach('idaten'),
  equip: { doubleMove: true },
};

export const bangasa: CardDef = {
  id: 'bangasa', name: '番傘', kind: 'equip', cost: 2, fx: 'bangasa',
  text: '自分の王以外の駒に付ける。付けた駒には相手の忍札が効かない（落とし穴・凍てつく床・相討ち・成り封じ・身代わりは、その駒には発動せず伏せたまま残る）',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p => p.kind !== 'OU'),
  resolve: attach('bangasa'),
  equip: { umbrella: true },
};

export const OMORI_TURNS = 3; // 重りの枷が付いている、付けられた側の手番の数

export const omori: CardDef = {
  id: 'omori', name: '重りの枷', kind: 'equip', cost: 2, fx: 'omori',
  text: '相手の王以外の駒に付ける（纏札が付いた駒にも付けられる）。その駒は、隣8マスのうち、もともと動けるマスにしか動けない。桂馬は動けなくなる。相手の3手番が終わると外れる',
  prompt: '重りの枷を付ける相手の駒を選んでください',
  targetSets: (s, side) => barePieces(s, opponent(side), p => p.kind !== 'OU'),
  resolve(ctx, [sq]) {
    const p = ctx.state.board[idx(sq)]!;
    p.equip = { cardId: 'omori', left: OMORI_TURNS };
    ctx.emit({ type: 'equipped', pieceId: p.id, cardId: 'omori' });
  },
  equip: { shackle: true },
};

export const EQUIP_CARDS: CardDef[] = [tenma, hagane, hikijin, bangasa, omori, idaten];
