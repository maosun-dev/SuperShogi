// 演出の段取り：出来事の記録（GameEvent）を、順番に流す演出の指示（Cue）にまとめる純粋な計算
// DOM も Three.js も使わない
import type { CardId, GameEvent, HandKind, Result, Side, Square } from '../rules/types';
import { CARDS } from '../cards';
import type { Settings } from '../app/storage';

export type Cue =
  | { kind: 'move'; side: Side; pieceId: number; from: Square; to: Square; promoted: boolean; captured?: { pieceId: number; at: Square } }
  | { kind: 'drop'; side: Side; pieceId: number; piece: HandKind; to: Square }
  | { kind: 'magic'; side: Side; cardId: CardId; targets: Square[]; effects: GameEvent[]; negated: boolean }
  | { kind: 'trapSet'; side: Side; cardId: CardId | null; at: Square | null }
  | { kind: 'trapFire'; owner: Side; cardId: CardId; at: Square | null; effects: GameEvent[] }
  | { kind: 'equip'; side: Side; pieceId: number; cardId: CardId; negated?: boolean }
  | { kind: 'armor'; defenderId: number; attackerId: number; at: Square }
  | { kind: 'second'; pieceId: number; from: Square; to: Square; promoted: boolean }   // 韋駄天の2回目
  | { kind: 'equipBreak'; pieceId: number; at: Square; cardId: CardId }              // 纏札が外れた（枷）
  | { kind: 'ward'; pieceId: number; at: Square; owner: Side; cardId: CardId }        // 番傘が罠を受け止めた（cardId は罠）
  | { kind: 'notice'; text: string }                                                   // 小さな知らせ
  | { kind: 'check'; side: Side }
  | { kind: 'gameOver'; result: Result };

type MagicCue = Extract<Cue, { kind: 'magic' }>;
type TrapFireCue = Extract<Cue, { kind: 'trapFire' }>;
type EquipCue = Extract<Cue, { kind: 'equip' }>;

// 人間は常に先手
const HUMAN: Side = 'sente';

// actor は行動した側。moved の出来事には側が入っていないので、これで補う
export function planFx(events: GameEvent[], actor: Side): Cue[] {
  const cues: Cue[] = [];
  // 効果の出来事を取り込む先（直近の魔法か罠の発動）
  let magic: MagicCue | null = null;
  let trap: TrapFireCue | null = null;
  // 装備カードを使った直後で、equipped を待っている cue
  let equip: EquipCue | null = null;
  // 直前の captured（直後の moved にまとめる）
  let captured: { pieceId: number; at: Square } | null = null;
  // この行動で動いた駒（同じ駒の2つ目の moved は second）
  const movedIds = new Set<number>();
  // 魔法の効果を流す先を決める：罠の発動が始まったらそちらが優先
  const sink = (): GameEvent[] | null => (trap ? trap.effects : magic ? magic.effects : null);

  for (const e of events) {
    switch (e.type) {
      case 'captured':
        captured = { pieceId: e.pieceId, at: e.at };
        break;
      case 'moved': {
        magic = trap = null;
        if (movedIds.has(e.pieceId)) {
          cues.push({ kind: 'second', pieceId: e.pieceId, from: e.from, to: e.to, promoted: e.promoted });
        } else {
          const cue: Cue = { kind: 'move', side: actor, pieceId: e.pieceId, from: e.from, to: e.to, promoted: e.promoted };
          if (captured) cue.captured = captured;
          cues.push(cue);
        }
        movedIds.add(e.pieceId);
        captured = null;
        break;
      }
      case 'dropped':
        magic = trap = null;
        cues.push({ kind: 'drop', side: e.side, pieceId: e.pieceId, piece: e.kind, to: e.to });
        break;
      case 'cardUsed':
        trap = null;
        if (CARDS[e.cardId].kind === 'magic') {
          magic = { kind: 'magic', side: e.side, cardId: e.cardId, targets: e.targets, effects: [], negated: false };
          cues.push(magic);
        } else {
          magic = null;
          equip = { kind: 'equip', side: e.side, pieceId: -1, cardId: e.cardId };
          cues.push(equip);
        }
        break;
      case 'equipped':
        if (equip) {
          equip.pieceId = e.pieceId;
          equip = null;
        }
        break;
      case 'trapSet':
        cues.push({ kind: 'trapSet', side: e.side, cardId: e.cardId, at: e.at });
        break;
      case 'trapTriggered':
        trap = { kind: 'trapFire', owner: e.owner, cardId: e.cardId, at: e.at, effects: [] };
        cues.push(trap);
        break;
      case 'magicNegated':
        // 直前の術札・纏札を「無効」にして、鏡の発動の中で見せる
        if (magic) magic.negated = true;
        if (equip && equip.pieceId < 0) { equip.negated = true; equip = null; }
        trap?.effects.push(e);
        break;
      case 'promotionBlocked':
      case 'kingGuarded':
        trap?.effects.push(e);
        break;
      case 'destroyed':
      case 'numbed':
      case 'reachLimited':
      case 'pushed':
      case 'swapped':
      case 'frozen':
      case 'demoted':
      case 'promotedInPlace':
      case 'handTransferred':
        sink()?.push(e);
        break;
      case 'warded':
        cues.push({ kind: 'ward', pieceId: e.pieceId, at: e.at, owner: e.owner, cardId: e.cardId });
        break;
      case 'armorBlocked':
        cues.push({ kind: 'armor', defenderId: e.defenderId, attackerId: e.attackerId, at: e.at });
        break;
      case 'secondMoveSkipped':
        cues.push({ kind: 'notice', text: '2回目の移動はできませんでした' });
        break;
      case 'equipBroken':
        cues.push({ kind: 'equipBreak', pieceId: e.pieceId, at: e.at, cardId: e.cardId });
        break;
      case 'passed':
        cues.push({
          kind: 'notice',
          text: e.side === HUMAN ? '指せる手がないので、手番が相手に移りました' : '相手は指せる手がないので、手番が戻りました',
        });
        break;
      case 'check':
        magic = trap = null;
        cues.push({ kind: 'check', side: e.side });
        break;
      case 'gameOver':
        cues.push({ kind: 'gameOver', result: e.result });
        break;
    }
  }
  return cues;
}

export interface FxTiming { scale: number; camera: boolean; shake: boolean; flashMax: number }

// 演出の長さ（短め／長め）と、動きを減らす設定から、演出の強さを決める
export function fxTiming(settings: Pick<Settings, 'fx' | 'volume'>, reducedMotion: boolean): FxTiming {
  const scale = settings.fx === 'short' ? 0.5 : 1;
  return reducedMotion
    ? { scale, camera: false, shake: false, flashMax: 0.4 }
    : { scale, camera: true, shake: true, flashMax: 0.9 };
}
