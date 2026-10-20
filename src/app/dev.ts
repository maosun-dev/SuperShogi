// 開発用の局面づくり（app 側に置く。view/fx は createGame/applyAction を使わない決まりのため）
import type { Action, CardId, GameState } from '../rules/types';
import { CARDS } from '../cards';
import { LEVELS, type Level } from '../ai/levels';
import type { Match } from './match';
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

// ---------- 演出の試し口（?fx=<カード>。開発中だけ） ----------

/**
 * ?fx=rakurai のように付けて開くと、そのカードを使える局面で対局画面を開く。Space キーで自分がそのカードを使う。
 * &kagami=1 で相手に鏡の結界を伏せておく（無効にされる流れの確認用）。&cpu=normal などで相手の持ち込みを変える。
 * 開発中（import.meta.env.DEV）だけ。ふだんは null
 */
export function fxMatchParams(): { level: Level; deck: CardId[]; initial: GameState; fxKey: true } | null {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(location.search);
  const id = q.get('fx') as CardId | null;
  if (!id || !(id in CARDS)) return null;
  const cpu = q.get('cpu');
  const level: Level = cpu === 'normal' || cpu === 'strong' ? cpu : 'weak';
  const s = createGame({ sente: [id], gote: cpu ? LEVELS[level].deck : [] });
  // 呼び戻し：相手に持ち駒を持たせる
  if (id === 'yobimodoshi') { s.players.gote.hand.KI = 1; s.players.gote.hand.FU = 2; }
  if (q.get('kagami')) s.traps.push({ uid: s.nextId++, owner: 'gote', cardId: 'kagami', at: null });
  return { level, deck: [id], initial: s, fxKey: true };
}

/** 試し口で使う行動：カードの行動のうち、対象の駒の種類が違うもの（入れ替えで同じ駒どうしを避ける）を先に選ぶ */
function pickCardAction(view: GameState, legal: Action[]): Action | undefined {
  const cards = legal.filter((a): a is Extract<Action, { type: 'card' }> => a.type === 'card');
  const kinds = (a: Extract<Action, { type: 'card' }>) => new Set(a.targets.map((t) => view.board[t.r * 9 + t.c]?.kind));
  return cards.find((a) => a.targets.length < 2 || kinds(a).size === a.targets.length) ?? cards[0];
}

/** Space キーで、試し口のカードを使う。戻り値で外す */
export function installFxKey(match: Match, submit: (a: Action) => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    if (match.phase() !== 'human') return;
    const a = pickCardAction(match.view(), match.legal());
    if (a) submit(a);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
