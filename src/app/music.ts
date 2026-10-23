// 画面ごとに流す曲。いまは対局の曲だけ（タイトル〜対局の前の曲はこれから作る）。
import type { MusicName } from '../fx/sound';
import type { ScreenName } from './screens';

export function musicFor(name: ScreenName): MusicName | null {
  return name === 'match' ? 'taikyoku' : null;
}
