// 画面ごとに流す曲。対局は設定で選んだ曲（おまかせなら毎局どれか）、結果画面は決着の決め音を聞かせるため無音、ほかはタイトルの曲。
import type { MusicName } from '../fx/sound';
import type { BgmChoice } from './storage';
import type { ScreenName } from './screens';

/** 対局の曲（設定の並び順） */
export const MATCH_TRACKS = ['taikyoku', 'taikyoku2', 'sakura'] as const satisfies readonly MusicName[];
export const MATCH_TRACK_LABEL: Record<(typeof MATCH_TRACKS)[number], string> = {
  taikyoku: '対局BGM1',
  taikyoku2: '対局BGM2',
  sakura: 'サクラドリフト',
};

/** 1局ぶんの対局の曲を決める。rnd は 0以上1未満（おまかせのときだけ使う） */
export function pickMatchTrack(choice: BgmChoice, rnd: number): MusicName {
  if (choice !== 'random') return choice;
  return MATCH_TRACKS[Math.min(MATCH_TRACKS.length - 1, Math.floor(rnd * MATCH_TRACKS.length))];
}

/** match は、その局に決めた曲 */
export function musicFor(name: ScreenName, match: MusicName = 'taikyoku'): MusicName | null {
  if (name === 'match') return match;
  if (name === 'result') return null;
  return 'title';
}
