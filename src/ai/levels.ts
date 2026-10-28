// CPU の強さ：序幕（弱い・ふつう・強い）と大詰（鬼・師範・傾奇者）。読む深さ・考える時間・わざと迷う度合い・
// わざと悪い手の割合・持ち込みカード（決まった札か、札見せのたびに引くくじ）
import type { CardId, GameState, Side } from '../rules/types';
import { legalActions } from '../rules/game';
import { CARDS } from '../cards';
import { actionKey, search, type SearchOptions, type SearchResult } from './search';
import { josekiMove } from './joseki';
import { makeRng } from './random';

export type Level = 'weak' | 'normal' | 'strong' | 'oni' | 'shihan' | 'kabuki';
/** 強さの並び（序幕の3つ→大詰の3つ） */
export const LEVEL_IDS: readonly Level[] = ['weak', 'normal', 'strong', 'oni', 'shihan', 'kabuki'];
export const JOMAKU: readonly Level[] = ['weak', 'normal', 'strong'];
export const OOZUME: readonly Level[] = ['oni', 'shihan', 'kabuki'];
/** 強さの名前（強さ選び・帯・札見せ・結果画面） */
export const LEVEL_NAME: Record<Level, string> = { weak: '弱い', normal: 'ふつう', strong: '強い', oni: '鬼', shihan: '師範', kabuki: '傾奇者' };
export function isLevel(v: unknown): v is Level {
  return typeof v === 'string' && (LEVEL_IDS as readonly string[]).includes(v);
}
export const TRAP_BEFORE_SHARE = 0.6; // 忍札を伏せられるうちは、時間のこの割合で考える
export const TRAP_AFTER_SHARE = 0.4;  // 伏せたあとの、続けて指す手
// 定跡の手に足す点（歩1枚＝100）。点づけの粗さ（玉を動かす手を高く見がち）を越えて定跡を指せるくらい
export const JOSEKI_BONUS = 150;
export interface LevelConfig extends Omit<SearchOptions, 'seed' | 'now'> {
  deck: CardId[];     // 決まった持ち込み（くじの強さでは空）
  kuji?: CardId[] | 'all'; // あれば、札見せのたびにこの範囲（'all' は全18枚）からくじで組む
  kujiGuard?: CardId[]; // くじの前に、この中から1枚だけ先に入れる（鬼の守りの札）
  joseki?: boolean;   // 序盤に定跡（joseki.ts）の手を勧める手として読む
  blunder: number;   // この割合で、読まずに駒を動かす手からでたらめに選ぶ（王を取れるときは除く）
}

// 持ち込みは計画8の数字で決め直す。
// maxNodes：速くする前（計画17の前）の作りが、パソコンで考える時間いっぱいに読めた量（1秒あたりの局面数×時間）。
// 読みを速くしても序幕の強さを今のまま保つための上限（遅い iPhone では今までどおり時間で止まる）
export const LEVELS: Record<Level, LevelConfig> = {
  weak: {
    maxDepth: 1, timeLimitMs: 300, maxNodes: 4_000, qDepth: 1, cardPlies: 1, cardWidth: 4, noise: 250, blunder: 0.15,
    deck: ['oshikaeshi', 'yobimodoshi', 'otoshiana', 'tenma'],
  },
  normal: {
    maxDepth: 3, timeLimitMs: 1000, maxNodes: 16_000, qDepth: 4, cardPlies: 1, cardWidth: 6, noise: 30, blunder: 0,
    deck: ['rakurai', 'hagane', 'yobimodoshi'],
  },
  strong: {
    maxDepth: 6, timeLimitMs: 3000, maxNodes: 53_000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 4, blunder: 0,
    deck: ['itetsuku', 'aiuchi', 'hagane', 'tenma'],
  },
  // 大詰：読む量の上限は付けず、速くなった読みを考える時間いっぱいに使う
  // 鬼：守りの札を1枚だけ入れ、残りは攻めの札でくじ（攻め中心。攻めの札だけだと、強いの罠と鎧に攻めを止められて
  // 強いに4割も勝てなかった。2026-10-27 の対局の数字）
  oni: {
    // 札を温存させる（使っていない札の値打ち2倍）：強いに 43%→59%（2026-10-28 の対局。3倍でも同じだった）
    maxDepth: 8, timeLimitMs: 3000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 4, blunder: 0, cardKeep: 2,
    deck: [],
    kuji: ['rakurai', 'oshikaeshi', 'irekae', 'shoryu', 'kakuotoshi', 'yobimodoshi', 'idaten', 'tenma', 'omori'],
    kujiGuard: ['hagane', 'itetsuku', 'aiuchi', 'otoshiana', 'narifuuji', 'hikijin', 'kagami', 'bangasa'],
  },
  // 師範：札の一発逆転を止める受けの札で固める（毎回同じ・コスト10）。序盤は定跡。
  // 2026-10 の札の直しで押し返しの風（2になった）を外した
  shihan: {
    maxDepth: 8, timeLimitMs: 4000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 4, blunder: 0,
    joseki: true, preferBonus: JOSEKI_BONUS, smartEval: true,
    deck: ['kagami', 'narifuuji', 'hagane', 'itetsuku', 'hikijin'],
  },
  // 傾奇者：全18枚からくじ。最後の相手。序盤は定跡
  kabuki: {
    maxDepth: 8, timeLimitMs: 5000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 4, blunder: 0, cardKeep: 2,
    joseki: true, preferBonus: JOSEKI_BONUS, smartEval: true,
    deck: [],
    kuji: 'all',
  },
};

// view は viewFor(本当の局面, side) で作った「見えている情報」だけの局面。
// timeScale は考える時間の倍率（CPU 同士を戦わせる道具で短くするため。アプリでは1）
export function chooseCpuAction(view: GameState, side: Side, level: Level, seed: number, timeScale = 1): SearchResult {
  const { deck: _deck, kuji: _kuji, joseki, blunder, ...opts } = LEVELS[level];
  if (blunder > 0) {
    const rng = makeRng(seed ^ 0x5bd1e995);
    if (rng() < blunder) {
      const acts = legalActions(view);
      const kingTake = acts.some(a => a.type === 'move' && view.board[a.to.r * 9 + a.to.c]?.kind === 'OU');
      const moves = acts.filter(a => a.type === 'move');
      if (!kingTake && moves.length > 0) {
        return { action: moves[Math.floor(rng() * moves.length)], score: 0, depth: 0, nodes: 0 };
      }
    }
  }
  // 忍札は伏せても手番が続くので、伏せる手と続けて指す手で1手番の時間を分ける（合わせて timeLimitMs まで）
  const canSetTrap = !view.trapSetThisTurn
    && view.players[side].cards.some(c => !c.used && CARDS[c.cardId].kind === 'trap');
  // 押し返しの風の続きも、伏せたあとと同じ短い時間
  const share = view.trapSetThisTurn || view.pushFollowUp ? TRAP_AFTER_SHARE : canSetTrap ? TRAP_BEFORE_SHARE : 1;
  // 読む量の上限も、考える時間と同じ割合で縮める（速くする前は時間で止まっていたので）
  const maxNodes = opts.maxNodes === undefined ? undefined : Math.max(1, Math.round(opts.maxNodes * timeScale * share));
  // 定跡：いちばん進んでいる定跡の次の手を、根で少し点を足して比べる（損なら指さない）
  const book = joseki ? josekiMove(view, side, seed) : null;
  const prefer = book ? actionKey(book.action) : undefined;
  return search(view, side, { ...opts, timeLimitMs: Math.max(20, opts.timeLimitMs * timeScale * share), maxNodes, prefer, seed });
}
