// 対局の進行：行動を受け取り、新しい局面と出来事の記録を返す
import type { Action, CardId, CardInstance, GameEvent, GameState, Handicap, HandKind, Piece, SetTrap, Side, Square } from './types';
import { IllegalActionError } from './types';
import { HAND_KINDS, applyHandicap, cloneState, emptyHand, idx, initialBoard, opponent, positionKey, sameSq, sqOf } from './board';
import { pieceValue } from './values';
import type { TrapTrigger } from '../cards/types';
import { canPromote, dropTargets, isInCheck, mustPromote, pieceTargets } from './moves';
import { CARDS, validateDeck } from '../cards';
import type { CardContext } from '../cards/types';

const MOVE_LIMIT = 300;
const REPETITION_LIMIT = 4;

// 王は1手番、王以外は2手番凍る
const FREEZE_KING = 1;
const FREEZE_OTHER = 2;

// 駒落ちがあるときは、駒を落とした側が先に指す
export function createGame(decks: Record<Side, CardId[]>, opts: { handicap?: Handicap } = {}): GameState {
  for (const side of ['sente', 'gote'] as Side[]) {
    const problem = validateDeck(decks[side]);
    if (problem) throw new IllegalActionError(problem);
  }
  const { board, nextId } = initialBoard();
  const handicap = opts.handicap && opts.handicap.kind !== 'none' ? opts.handicap : null;
  if (handicap) applyHandicap(board, handicap);
  const s: GameState = {
    board,
    players: {
      sente: { hand: emptyHand(), cards: [] },
      gote: { hand: emptyHand(), cards: [] },
    },
    traps: [],
    turn: handicap ? handicap.side : 'sente',
    ply: 0,
    trapSetThisTurn: false,
    seen: {},
    result: null,
    nextId,
  };
  for (const side of ['sente', 'gote'] as Side[]) {
    s.players[side].cards = decks[side].map(cardId => ({ uid: s.nextId++, cardId, used: false }));
  }
  s.seen[positionKey(s)] = 1;
  return s;
}

// 移動で選べる「成る／成らない」
// 成れない駒が、成らないと行き所のないマスへ動く手は出さない（空配列）
function promoteOptions(p: Piece, from: Square, to: Square): boolean[] {
  if (!p.promoted && mustPromote(p.kind, p.side, to)) return p.sealed ? [] : [true];
  if (canPromote(p, from, to)) return [true, false];
  return [false];
}

export function legalActions(s: GameState): Action[] {
  if (s.result) return [];
  const side = s.turn;
  const out: Action[] = [];
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== side) continue;
    const from = sqOf(i);
    const double = hasEquip(p, 'doubleMove');
    for (const to of pieceTargets(s, from)) {
      const target = s.board[idx(to)];
      for (const promote of promoteOptions(p, from, to)) {
        out.push({ type: 'move', from, to, promote });
        // 韋駄天：取らない2回目。1手目で王を取るなら2回目はない
        if (double && target?.kind !== 'OU') {
          for (const second of secondMoves(s, p, from, to, promote)) {
            out.push({ type: 'move', from, to, promote, second });
          }
        }
      }
    }
  }
  for (const kind of HAND_KINDS) {
    if (s.players[side].hand[kind] <= 0) continue;
    for (const to of dropTargets(s, side, kind)) out.push({ type: 'drop', kind, to });
  }
  for (const c of s.players[side].cards) {
    if (c.used) continue;
    const def = CARDS[c.cardId];
    if (def.kind === 'trap' && s.trapSetThisTurn) continue; // 忍札は1手番に1枚まで
    for (const targets of def.targetSets(s, side)) {
      if (def.choices) {
        for (const pick of def.choices(s, side)) out.push({ type: 'card', uid: c.uid, targets, pick });
      } else {
        out.push({ type: 'card', uid: c.uid, targets });
      }
    }
  }
  return out;
}

function hasEquip(p: Piece, flag: 'armor' | 'doubleMove'): boolean {
  return !!p.equip && !!CARDS[p.equip.cardId].equip?.[flag];
}

// 韋駄天の2回目：1手目のあとの盤で、駒を取らずに動ける先
function secondMoves(s: GameState, p: Piece, from: Square, to: Square, promote: boolean): { to: Square; promote: boolean }[] {
  const moved: Piece = { ...p, promoted: p.promoted || promote };
  const board = [...s.board];
  board[idx(from)] = null;
  board[idx(to)] = moved;
  const after: GameState = { ...s, board };
  const out: { to: Square; promote: boolean }[] = [];
  for (const to2 of pieceTargets(after, to)) {
    if (board[idx(to2)]) continue;
    for (const promote2 of promoteOptions(moved, to, to2)) out.push({ to: to2, promote: promote2 });
  }
  return out;
}

function sameAction(a: Action, b: Action): boolean {
  if (a.type === 'move' && b.type === 'move') {
    if (!sameSq(a.from, b.from) || !sameSq(a.to, b.to) || a.promote !== b.promote) return false;
    if (!a.second || !b.second) return !a.second && !b.second;
    return sameSq(a.second.to, b.second.to) && a.second.promote === b.second.promote;
  }
  if (a.type === 'drop' && b.type === 'drop') return a.kind === b.kind && sameSq(a.to, b.to);
  if (a.type === 'card' && b.type === 'card') {
    return a.uid === b.uid && a.pick === b.pick && a.targets.length === b.targets.length
      && a.targets.every((t, i) => sameSq(t, b.targets[i]));
  }
  return false;
}

export function applyAction(s0: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  if (s0.result) throw new IllegalActionError('対局はもう終わっています');
  if (!legalActions(s0).some(b => sameAction(a, b))) throw new IllegalActionError('反則の行動です');
  return applyActionUnchecked(s0, a);
}

// 合法かどうかの確認をしない適用（CPU の読み用）。legalActions から選んだ行動だけを渡すこと
export function applyActionUnchecked(s0: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  if (s0.result) throw new IllegalActionError('対局はもう終わっています');
  const s = cloneState(s0);
  const events: GameEvent[] = [];
  const side = s.turn;

  if (a.type === 'move') {
    const p = s.board[idx(a.from)]!;
    const first = stepMove(s, events, a.from, a.to, a.promote);
    if (s.result) return { state: s, events };
    if (a.second) {
      // 1手目で止められた・駒が消えた・成りを封じられて2回目の動きができなくなったときは、2回目を飛ばす
      const still = first === 'moved' && s.board[idx(a.to)]?.id === p.id;
      const second = a.second;
      if (still && secondMoves(s, p, a.to, a.to, false).some(m => sameSq(m.to, second.to) && m.promote === second.promote)) {
        stepMove(s, events, a.to, a.second.to, a.second.promote);
      } else {
        events.push({ type: 'secondMoveSkipped', pieceId: p.id });
      }
    }
  } else if (a.type === 'drop') {
    const p: Piece = { id: s.nextId++, kind: a.kind, side, promoted: false, equip: null };
    s.players[side].hand[a.kind]--;
    s.board[idx(a.to)] = p;
    events.push({ type: 'dropped', pieceId: p.id, side, kind: a.kind, to: a.to });
    enterSquare(s, events, a.to);
  } else {
    const inst = s.players[side].cards.find(c => c.uid === a.uid)!;
    useCard(s, events, side, inst, a.targets, a.pick);
    if (CARDS[inst.cardId].kind === 'trap') {
      // 忍札は伏せても手番が終わらない。続けて行える行動が無いときだけ手番を回す
      s.trapSetThisTurn = true;
      if (!hasAnyAction(s)) {
        events.push({ type: 'passed', side });
        endTurn(s, events);
      }
      return { state: s, events };
    }
  }

  endTurn(s, events);
  return { state: s, events };
}

// 駒を1回動かす。鋼の鎧・身代わりに止められたら 'blocked'
function stepMove(s: GameState, events: GameEvent[], from: Square, to: Square, promote: boolean): 'moved' | 'blocked' {
  const p = s.board[idx(from)]!;
  const side = p.side;
  const target = s.board[idx(to)];
  if (target && hasEquip(target, 'armor')) {
    // 鋼の鎧：取らずに守り、鎧は外れる。攻めた駒は元のマスのまま
    target.equip = null;
    events.push({ type: 'armorBlocked', defenderId: target.id, attackerId: p.id, at: to });
    return 'blocked';
  }
  if (target?.kind === 'OU' && guardKing(s, events, target, to, p)) return 'blocked';
  if (promote && !mustPromote(p.kind, side, to)) {
    // 成り封じ：成らずに動く（成らないと行き所がない手では発動しない）。その駒は対局の終わりまで成れない
    const t = findTrap(s, opponent(side), 'promote');
    if (t) {
      fireTrap(s, events, t);
      p.sealed = true;
      events.push({ type: 'promotionBlocked', pieceId: p.id });
      promote = false;
    }
  }
  if (target) {
    // 取る：成りを戻して取った側の持ち駒へ（装備は付いてこない）
    events.push({ type: 'captured', pieceId: target.id, at: to, by: side });
    if (target.kind !== 'OU') s.players[side].hand[target.kind as HandKind]++;
  }
  s.board[idx(from)] = null;
  s.board[idx(to)] = p;
  if (promote) p.promoted = true;
  events.push({ type: 'moved', pieceId: p.id, from, to, promoted: promote });
  if (target?.kind === 'OU') {
    finish(s, events, { winner: side, reason: 'king-captured' });
    return 'moved';
  }
  if (target && p.kind !== 'OU') {
    // 相討ち：取った駒も壊す（王で取ったときは発動せず残る）
    const t = findTrap(s, target.side, 'capture');
    if (t) {
      fireTrap(s, events, t);
      destroyAt(s, events, to, 'aiuchi');
      return 'moved';
    }
  }
  enterSquare(s, events, to);
  return 'moved';
}

// 身代わり：王の隣8マスの味方のうちいちばん安い駒（同じなら盤の順で先）を代わりに壊す。発動したら true
function guardKing(s: GameState, events: GameEvent[], king: Piece, at: Square, attacker: Piece): boolean {
  const t = findTrap(s, king.side, 'kingCapture');
  if (!t) return false;
  let best: { sq: Square; value: number } | null = null;
  for (let i = 0; i < 81; i++) {
    const q = s.board[i];
    const sq = sqOf(i);
    if (!q || q.side !== king.side || q.id === king.id) continue;
    if (Math.abs(sq.c - at.c) > 1 || Math.abs(sq.r - at.r) > 1) continue;
    const v = pieceValue(q);
    if (!best || v < best.value) best = { sq, value: v };
  }
  if (!best) return false;
  fireTrap(s, events, t);
  destroyAt(s, events, best.sq, 'migawari');
  events.push({ type: 'kingGuarded', attackerId: attacker.id, kingId: king.id, at });
  return true;
}

// 駒を凍らせる。持ち主の手番の最中なら、その手番の終わりの1減りの分を足しておく
function freezePiece(s: GameState, events: GameEvent[], sq: Square): void {
  const p = s.board[idx(sq)];
  if (!p) return;
  const turns = p.kind === 'OU' ? FREEZE_KING : FREEZE_OTHER;
  p.frozen = p.side === s.turn ? turns + 1 : turns;
  events.push({ type: 'frozen', pieceId: p.id, at: sq, turns });
}

// side が伏せた札のうち、trigger で発動するもの（uid が小さい1枚）
function findTrap(s: GameState, owner: Side, trigger: TrapTrigger): SetTrap | undefined {
  return s.traps
    .filter(t => t.owner === owner && t.cardId && CARDS[t.cardId].trap?.trigger === trigger)
    .sort((a, b) => a.uid - b.uid)[0];
}

// 罠を取り除き、発動を記録する
function fireTrap(s: GameState, events: GameEvent[], t: SetTrap): void {
  s.traps = s.traps.filter(x => x.uid !== t.uid);
  events.push({ type: 'trapTriggered', owner: t.owner, uid: t.uid, cardId: t.cardId!, at: t.at });
}

// 駒を消す（誰の持ち駒にもならない）
function destroyAt(s: GameState, events: GameEvent[], sq: Square, cause: CardId): void {
  const p = s.board[idx(sq)];
  if (!p) return;
  s.board[idx(sq)] = null;
  events.push({ type: 'destroyed', pieceId: p.id, at: sq, cause });
}

// 駒がマスに入ったとき：駒の持ち主と反対の側の、マスに伏せた札があれば発動する。
// 落とし穴は王には発動せず残る。凍てつく床は王も凍らせる
function enterSquare(s: GameState, events: GameEvent[], sq: Square): void {
  const p = s.board[idx(sq)];
  if (!p) return;
  const t = s.traps
    .filter(t => t.owner !== p.side && t.at && sameSq(t.at, sq) && t.cardId && CARDS[t.cardId].trap?.trigger === 'enter')
    .filter(t => !(p.kind === 'OU' && t.cardId === 'otoshiana'))
    .sort((a, b) => a.uid - b.uid)[0];
  if (!t) return;
  fireTrap(s, events, t);
  if (t.cardId === 'itetsuku') freezePiece(s, events, sq);
  else destroyAt(s, events, sq, t.cardId!);
}

function cardContext(s: GameState, events: GameEvent[], side: Side): CardContext {
  return {
    state: s,
    side,
    emit: e => { events.push(e); },
    destroy(sq, cause) {
      destroyAt(s, events, sq, cause);
    },
    relocate(from, to) {
      s.board[idx(to)] = s.board[idx(from)];
      s.board[idx(from)] = null;
      enterSquare(s, events, to);
    },
    swap(a, b) {
      const pa = s.board[idx(a)];
      s.board[idx(a)] = s.board[idx(b)];
      s.board[idx(b)] = pa;
      enterSquare(s, events, a);
      enterSquare(s, events, b);
    },
    promoteInPlace(sq) {
      const p = s.board[idx(sq)]!;
      const t = findTrap(s, opponent(p.side), 'promote');
      if (t) {
        fireTrap(s, events, t);
        p.sealed = true;
        events.push({ type: 'promotionBlocked', pieceId: p.id });
        return;
      }
      p.promoted = true;
      events.push({ type: 'promotedInPlace', pieceId: p.id, at: sq });
    },
  };
}

function useCard(
  s: GameState, events: GameEvent[], side: Side, inst: CardInstance, targets: Square[], pick?: HandKind,
): void {
  const def = CARDS[inst.cardId];
  inst.used = true;
  if (def.trap) {
    // 罠を伏せる。場所が漏れないよう cardUsed は出さない
    const uid = s.nextId++;
    const at = def.trap.placement === 'square' ? targets[0] : null;
    s.traps.push({ uid, owner: side, cardId: def.id, at });
    events.push({ type: 'trapSet', side, uid, cardId: def.id, at });
    return;
  }
  events.push({ type: 'cardUsed', side, cardId: inst.cardId, targets });
  if (def.kind === 'magic' && def.cost >= 2) {
    // 鏡の結界：コスト2以上の術札を、効果の前に打ち消す。使った側の手番はそのまま終わる
    const t = findTrap(s, opponent(side), 'magic');
    if (t) {
      fireTrap(s, events, t);
      events.push({ type: 'magicNegated', side, cardId: def.id });
      return;
    }
  }
  def.resolve?.(cardContext(s, events, side), targets, pick);
}

function finish(s: GameState, events: GameEvent[], result: NonNullable<GameState['result']>): void {
  s.result = result;
  events.push({ type: 'gameOver', result });
}

// 手番の後処理：手番交代・王手の知らせ・千日手・手数の上限
function endTurn(s: GameState, events: GameEvent[]): void {
  const mover = s.turn;
  // 手番を終えた側の凍った駒は、残りを1減らす
  for (const p of s.board) {
    if (!p || p.side !== mover || !p.frozen) continue;
    p.frozen--;
    if (p.frozen <= 0) delete p.frozen;
  }
  s.trapSetThisTurn = false;
  s.turn = opponent(mover);
  s.ply++;
  if (isInCheck(s, s.turn)) events.push({ type: 'check', side: s.turn });
  const key = positionKey(s);
  s.seen[key] = (s.seen[key] ?? 0) + 1;
  if (s.seen[key] >= REPETITION_LIMIT) {
    finish(s, events, { winner: null, reason: 'repetition' });
  } else if (s.ply > MOVE_LIMIT) {
    finish(s, events, { winner: null, reason: 'move-limit' });
  } else if (!hasAnyAction(s)) {
    // 指せる行動が1つもない（凍った王だけ、など）ときは、手番を自動で相手へ回す
    events.push({ type: 'passed', side: s.turn });
    endTurn(s, events);
  }
}

// 行動が1つでもあるか（駒の移動はすぐ見つかることが多いので先に調べる）
function hasAnyAction(s: GameState): boolean {
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== s.turn) continue;
    const from = sqOf(i);
    if (pieceTargets(s, from).some(to => promoteOptions(p, from, to).length > 0)) return true;
  }
  return legalActions(s).length > 0;
}
