// 画面ごとに流す曲。対局は2曲を対局ごとに交互に、結果画面は決着の決め音を聞かせるため無音、ほかはタイトルの曲。
import type { MusicName } from '../fx/sound';
import type { ScreenName } from './screens';

const MATCH_TRACKS: MusicName[] = ['taikyoku', 'sakura'];

/** round は何局目か（0から）。対局の曲を交互に選ぶのに使う */
export function musicFor(name: ScreenName, round = 0): MusicName | null {
  if (name === 'match') return MATCH_TRACKS[round % MATCH_TRACKS.length];
  if (name === 'result') return null;
  return 'title';
}
