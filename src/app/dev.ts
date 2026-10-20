// 開発用の局面づくり（app 側に置く。view/fx は createGame/applyAction を使わない決まりのため）
import type { GameState } from '../rules/types';
import { createGame } from '../rules/game';
import { viewFor } from '../rules/view';

/** 初期配置（先手から見た局面） */
export function initialView(): GameState {
  return viewFor(createGame({ sente: [], gote: [] }), 'sente');
}

/**
 * 盤の見た目を確かめるための局面：成り駒・装備・自分の落とし穴・王手・凍った側をひと通り入れる。
 * 本物の対局では起きない並びもある（見た目の確認専用）
 */
export function sampleView(): GameState {
  const s = createGame({ sente: [], gote: [] });
  const at = (c: number, r: number) => r * 9 + c;
  // 先手の飛車を 5三 に進めて竜にし、天馬の蹄を付ける（後手の王に王手）
  const hi = s.board[at(7, 7)]!;
  s.board[at(7, 7)] = null;
  s.board[at(4, 2)] = { ...hi, promoted: true, equip: { cardId: 'tenma' } };
  // 後手の歩を1枚「と」にする（後手の駒は逆さの紅の字）
  const fu = s.board[at(0, 2)]!;
  s.board[at(0, 3)] = { ...fu, promoted: true };
  s.board[at(0, 2)] = null;
  // 先手の銀に鋼の鎧
  const gi = s.board[at(2, 8)]!;
  s.board[at(2, 8)] = { ...gi, equip: { cardId: 'hagane' } };
  // 自分（先手）の落とし穴と、相手の隠れた罠
  s.traps.push({ uid: 900, owner: 'sente', cardId: 'otoshiana', at: { c: 4, r: 4 } });
  s.traps.push({ uid: 901, owner: 'gote', cardId: 'otoshiana', at: { c: 6, r: 5 } });
  s.frozen = 'gote';
  return viewFor(s, 'sente');
}

/** URL に ?dev=board があれば確認用の局面、なければ初期配置 */
export function titleView(): GameState {
  const q = new URLSearchParams(location.search);
  return q.get('dev') === 'board' ? sampleView() : initialView();
}
