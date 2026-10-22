// 纏札6枚
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
  id: 'hagane', name: '鋼の鎧', kind: 'equip', cost: 2, fx: 'hagane',
  text: '付けた駒が取られそうになったとき、1回だけ守る。取ろうとした駒は元のマスに戻り、相手の手番は終わる。術札や忍札からは守らない。王には付けられない',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p => p.kind !== 'OU'),
  resolve: attach('hagane'),
  equip: { armor: true },
};

export const hikijin: CardDef = {
  id: 'hikijin', name: '退き陣の旗', kind: 'equip', cost: 1, fx: 'hikijin',
  text: '自分のまだ成っていない歩・香車・桂馬・銀に付ける。付けた駒は、真後ろへ1マス下がれる',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p =>
    !p.promoted && (p.kind === 'FU' || p.kind === 'KY' || p.kind === 'KE' || p.kind === 'GI')),
  resolve: attach('hikijin'),
  equip: { retreat: true },
};

export const idaten: CardDef = {
  id: 'idaten', name: '韋駄天', kind: 'equip', cost: 5, fx: 'idaten',
  text: '付けた駒は、1手で2回動ける。2回目の移動はしなくてもよい。2回目の移動では駒を取れない',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: bareOwnPieces,
  resolve: attach('idaten'),
  equip: { doubleMove: true },
};

export const tsuranuki: CardDef = {
  id: 'tsuranuki', name: '貫きの槍', kind: 'equip', cost: 4, fx: 'tsuranuki',
  text: '自分の飛車・角・香車（竜・馬も）に付ける。1回だけ、まっすぐ進む途中にある駒を1つ飛び越えて動ける。飛び越えた先にいる相手の駒は取れる。飛び越えると札は外れる',
  prompt: '纏札を付ける自分の駒を選んでください',
  targetSets: (s, side) => barePieces(s, side, p =>
    p.kind === 'HI' || p.kind === 'KA' || (p.kind === 'KY' && !p.promoted)),
  resolve: attach('tsuranuki'),
  equip: { pierce: true },
};

export const omori: CardDef = {
  id: 'omori', name: '重りの枷', kind: 'equip', cost: 3, fx: 'omori',
  text: '相手の王以外の駒に付ける。その駒は、隣8マスのうち、もともと動けるマスにしか動けない。桂馬は動けなくなる',
  prompt: '重りの枷を付ける相手の駒を選んでください',
  targetSets: (s, side) => barePieces(s, opponent(side), p => p.kind !== 'OU'),
  resolve: attach('omori'),
  equip: { shackle: true },
};

export const EQUIP_CARDS: CardDef[] = [tenma, hagane, hikijin, tsuranuki, omori, idaten];
