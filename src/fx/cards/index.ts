// 札の id から、その札の演出を引く表。札1枚につき1ファイル（src/fx/cards/<id>.ts）
import type { CardId } from '../../rules/types';
import type { CardFx, EquipFx, MagicCue, TrapFireCue } from './types';
import { oshikaeshi } from './oshikaeshi';
import { irekae } from './irekae';
import { shoryu } from './shoryu';
import { yobimodoshi } from './yobimodoshi';
import { kakuotoshi } from './kakuotoshi';
import { rakurai } from './rakurai';
import { itetsuku } from './itetsuku';
import { otoshiana } from './otoshiana';
import { narifuuji } from './narifuuji';
import { kagami } from './kagami';
import { aiuchi } from './aiuchi';
import { migawari } from './migawari';

export const MAGIC_FX: Partial<Record<CardId, CardFx<MagicCue>>> = {
  oshikaeshi, irekae, shoryu, yobimodoshi, kakuotoshi, rakurai,
};

export const TRAP_FX: Partial<Record<CardId, CardFx<TrapFireCue>>> = {
  itetsuku, otoshiana, narifuuji, kagami, aiuchi, migawari,
};

export const EQUIP_FX: Partial<Record<CardId, EquipFx>> = {};
