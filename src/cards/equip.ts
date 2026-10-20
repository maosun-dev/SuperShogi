// 装備カード4枚（効果は作業5で入れる。それまでは使えない）
import type { CardDef } from './types';

const notYet = () => [];

export const tenma: CardDef = {
  id: 'tenma', name: '天馬の蹄', kind: 'equip', cost: 2, fx: 'tenma',
  text: '付けた駒が、桂馬の動きも使えるようになる',
  targetSets: notYet,
};

export const hagane: CardDef = {
  id: 'hagane', name: '鋼の鎧', kind: 'equip', cost: 3, fx: 'hagane',
  text: '付けた駒が取られそうになったとき、1回だけ守る。取ろうとした駒は元のマスに戻り、相手の手番は終わる。魔法や罠からは守らない',
  targetSets: notYet,
};

export const tate: CardDef = {
  id: 'tate', name: '王の盾', kind: 'equip', cost: 4, fx: 'tate',
  text: '付けた駒と、その周り8マスの味方の駒は、相手の魔法を受けない',
  targetSets: notYet,
};

export const idaten: CardDef = {
  id: 'idaten', name: '韋駄天', kind: 'equip', cost: 5, fx: 'idaten',
  text: '付けた駒は、1手で2回動ける。2回目の移動はしなくてもよい。2回目の移動では駒を取れない',
  targetSets: notYet,
};

export const EQUIP_CARDS: CardDef[] = [tenma, hagane, tate, idaten];
