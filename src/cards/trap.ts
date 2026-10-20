// 罠カード3枚（効果は作業6で入れる。それまでは使えない）
import type { CardDef } from './types';

const notYet = () => [];

export const otoshiana: CardDef = {
  id: 'otoshiana', name: '落とし穴', kind: 'trap', cost: 2, fx: 'otoshiana',
  text: 'このマスに入った相手の駒を破壊する。王が入ったときは発動せず、罠は残る',
  targetSets: notYet,
  trap: { placement: 'square', trigger: 'enter' },
};

export const kagami: CardDef = {
  id: 'kagami', name: '鏡の結界', kind: 'trap', cost: 3, fx: 'kagami',
  text: '相手が魔法を使ったとき、その魔法を無効にする。無効にされた側の手番は終わる',
  targetSets: notYet,
  trap: { placement: 'slot', trigger: 'magic' },
};

export const narifuuji: CardDef = {
  id: 'narifuuji', name: '成り封じ', kind: 'trap', cost: 1, fx: 'narifuuji',
  text: '相手が成ろうとしたとき、成れなくする。成らないと行き所がなくなる場合は発動しない',
  targetSets: notYet,
  trap: { placement: 'slot', trigger: 'promote' },
};

export const TRAP_CARDS: CardDef[] = [otoshiana, kagami, narifuuji];
