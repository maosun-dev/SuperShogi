// 王を取る・取られる演出の4案（仮）。あとで案をしぼるときは、ここの表とファイルを消す
import type { KingFx } from './kinds';
import type { KingFxPlay } from './common';
import { tataki } from './tataki';
import { iai } from './iai';
import { hanabi } from './hanabi';
import { yatai } from './yatai';

export const KING_FX_PLAY: Record<KingFx, KingFxPlay> = { tataki, iai, hanabi, yatai };
