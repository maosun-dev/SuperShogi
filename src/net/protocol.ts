// 友と対局：2台の間で送るもの。すべて JSON の文字にして送る
import type { Action, CardId, Handicap, Side } from '../rules/types';
import type { Setup } from './record';
import { isKingFx } from '../fx/kingfx/kinds';

export type Msg =
  | { t: 'hello'; version: string; matchId: string | null }
  | { t: 'ready'; deck: CardId[]; handicap?: Handicap }
  | { t: 'start'; matchId: string; setup: Setup }
  | { t: 'act'; n: number; action: Action; fp: string }
  | { t: 'resign'; n: number }
  | { t: 'matta'; to: number }
  | { t: 'mattaReply'; ok: boolean; to: number }
  | { t: 'mattaCancel' }
  | { t: 'sync'; n: number }
  | { t: 'log'; from: number; actions: Action[]; fps: string[] }
  | { t: 'quit' };

export function encodeMsg(m: Msg): string {
  return JSON.stringify(m);
}

// ---- 受け取ったものの形を確かめる（中身の正しさはルールが確かめる） ----
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isSide = (v: unknown): v is Side => v === 'sente' || v === 'gote';
const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isSq = (v: unknown): boolean => isObj(v) && isNum(v.c) && isNum(v.r) && v.c < 9 && v.r < 9;
const isHandicap = (v: unknown): v is Handicap => isObj(v) && isSide(v.side) && isStr(v.kind);

function isAction(v: unknown): v is Action {
  if (!isObj(v)) return false;
  if (v.type === 'move') {
    return isSq(v.from) && isSq(v.to) && typeof v.promote === 'boolean'
      && (v.second === undefined || (isObj(v.second) && isSq(v.second.to) && typeof v.second.promote === 'boolean'));
  }
  if (v.type === 'drop') return isStr(v.kind) && isSq(v.to);
  if (v.type === 'card') return isNum(v.uid) && Array.isArray(v.targets) && v.targets.every(isSq) && (v.pick === undefined || isStr(v.pick));
  return false;
}

function isSetup(v: unknown): v is Setup {
  return isObj(v) && isObj(v.decks) && isStrs(v.decks.sente) && isStrs(v.decks.gote) && isHandicap(v.handicap) && isSide(v.first) && isKingFx(v.kingFx);
}

function isMsg(m: Obj): boolean {
  switch (m.t) {
    case 'hello': return isStr(m.version) && (m.matchId === null || isStr(m.matchId));
    case 'ready': return isStrs(m.deck) && (m.handicap === undefined || isHandicap(m.handicap));
    case 'start': return isStr(m.matchId) && isSetup(m.setup);
    case 'act': return isNum(m.n) && isAction(m.action) && isStr(m.fp);
    case 'resign': return isNum(m.n);
    case 'matta': return isNum(m.to);
    case 'mattaReply': return typeof m.ok === 'boolean' && isNum(m.to);
    case 'mattaCancel': case 'quit': return true;
    case 'sync': return isNum(m.n);
    case 'log': return isNum(m.from) && Array.isArray(m.actions) && m.actions.every(isAction) && isStrs(m.fps)
      && m.fps.length === m.actions.length;
    default: return false;
  }
}

/** 形が合わなければ null（知らない種類・壊れた文字も） */
export function parseMsg(raw: string): Msg | null {
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) && isMsg(v) ? (v as Msg) : null;
  } catch {
    return null;
  }
}
