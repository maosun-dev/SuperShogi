// 大詰のエンディングの台本：何秒に何をするか・回り舞台に並べる札・札の役名・クレジット。
// 設計書 docs/superpowers/specs/2026-10-28-kabuki-ending-design.md。three を読まない純粋な部品（テストで中身を確かめる）。
// 曲の区切り（87・95・105秒）は音の大きさで見立てた値。実際に聴いてずれていたら、ここの数字だけ直す
import type { CardId } from '../../rules/types';
import type { MusicName } from '../../fx/sound';
import { CARDS } from '../../cards';

export const ENDING_TRACK: MusicName = 'sakura'; // サクラドリフト
export const ENDING_LEN = 110;     // 曲の 0:00〜1:50。曲は止めずに流したまま、結果画面へ移るときに消える（2026-10-28 ユーザー）

/** open＝幕が開く／turn＝回り舞台／bloom＝桜が一気に舞い幕が閉まる／kojo＝口上の紙／ooiri＝大入と打ち出し／done＝終わり */
export type EndingScene = 'open' | 'turn' | 'bloom' | 'kojo' | 'ooiri' | 'done';

export const SCENES: readonly { scene: EndingScene; at: number }[] = [
  { scene: 'open', at: 0 },
  { scene: 'turn', at: 5 },
  { scene: 'bloom', at: 87 },
  { scene: 'kojo', at: 95 },
  { scene: 'ooiri', at: 105 },
  { scene: 'done', at: ENDING_LEN },
];

/** t 秒のときの場面。t が負なら open、曲の終わり以降は done */
export function sceneAt(t: number): EndingScene {
  let cur: EndingScene = 'open';
  for (const s of SCENES) if (t >= s.at) cur = s.scene;
  return cur;
}

/** 札の役名（設計書4章） */
export const ROLES: Record<CardId, string> = {
  rakurai: '雷神の役',
  oshikaeshi: '風神の役',
  irekae: '早替わりの役',
  shoryu: '立身出世の役',
  kakuotoshi: '落ちぶれ浪人の役',
  yobimodoshi: '引き戻す使者の役',
  idaten: '飛脚の役',
  tenma: '天駆ける駒の役',
  omori: '牢番の役',
  hagane: '鎧武者の役',
  itetsuku: '雪女の役',
  aiuchi: '捨て身の剣客の役',
  otoshiana: '穴掘り忍びの役',
  narifuuji: '封じの陰陽師の役',
  hikijin: '旗本の役',
  kagami: '鏡の巫女の役',
  bangasa: '傘差す町娘の役',
  migawari: '影武者の役',
};

/** 回り舞台に並べる順（札の一覧の並びのまま） */
export const CAST_ORDER: readonly CardId[] = Object.keys(CARDS) as CardId[];

const TURN_FROM = 5;
const TURN_TO = 87;

/** 回り舞台の間（5〜87秒）を18等分して、正面に来ている札。ほかの場面では null */
export function castAt(t: number): CardId | null {
  if (t < TURN_FROM || t >= TURN_TO) return null;
  const i = Math.floor((t - TURN_FROM) / ((TURN_TO - TURN_FROM) / CAST_ORDER.length));
  return CAST_ORDER[Math.min(CAST_ORDER.length - 1, i)];
}

/** 口上の紙に横書きで出すクレジット。名前はローマ字だけ（本名の漢字は出さない） */
export const STAFF = [
  { role: '作', name: 'maosun-dev' },
  { role: '御礼', name: 'DAIKI YAMADA' },
] as const;
