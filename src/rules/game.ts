// 対局の進行：行動を受け取り、新しい局面と出来事の記録を返す
import type { Action, CardId, CardInstance, GameEvent, GameState, HandKind, Piece, SetTrap, Side, Square } from './types';
import { IllegalActionError } from './types';
import { HAND_KINDS, cloneState, emptyHand, idx, initialBoard, opponent, positionKey, sameSq, sqOf } from './board';
import { canPromote, dropTargets, isInCheck, mustPromote, pieceTargets } from './moves';
import { CARDS, validateDeck } from '../cards';
import type { CardContext } from '../cards/types';

const MOVE_LIMIT = 300;
const REPETITION_LIMIT = 4;

export function createGame(decks: Record<Side, CardId[]>): GameState {
  for (const side of ['sente', 'gote'] as Side[]) {
    const problem = validateDeck(decks[side]);
    if (problem) throw new IllegalActionError(problem);
  }
  const { board, nextId } = initialBoard();
  const s: GameState = {
    board,
    players: {
      sente: { hand: emptyHand(), cards: [] },
      gote: { hand: emptyHand(), cards: [] },
    },
    traps: [],
    turn: 'sente',
    ply: 0,
    frozen: null,
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
function promoteOptions(p: Piece, from: Square, to: Square): boolean[] {
  if (!p.promoted && mustPromote(p.kind, p.side, to)) return [true];
  if (canPromote(p, from, to)) return [true, false];
  return [false];
}

export function legalActions(s: GameState): Action[] {
  if (s.result) return [];
  const side = s.turn;
  const frozen = s.frozen === side;
  const out: Action[] = [];
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== side) continue;
    const from = sqOf(i);
    const double = hasEquip(p, 'doubleMove');
    for (const to of pieceTargets(s, from)) {
      const target = s.board[idx(to)];
      // 凍てつく盤：この手番は相手の駒のマスへ動けない
      if (frozen && target) continue;
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
  }

  endTurn(s, events);
  return { state: s, events };
}

// 駒を1回動かす。鋼の鎧に止められたら 'blocked'
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
  if (promote && !mustPromote(p.kind, side, to)) {
    // 成り封じ：成らずに動く（成らないと行き所がない手では発動しない）
    const t = findTrap(s, opponent(side), 'promote');
    if (t) {
      fireTrap(s, events, t);
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
  if (target?.kind === 'OU') finish(s, events, { winner: side, reason: 'king-captured' });
  else enterSquare(s, events, to);
  return 'moved';
}

// side が伏せた罠のうち、trigger で発動するもの（uid が小さい1枚）
function findTrap(s: GameState, owner: Side, trigger: 'magic' | 'promote'): SetTrap | undefined {
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

// 駒がマスに入ったとき：駒の持ち主と反対の側の落とし穴があれば発動する。王なら発動せず罠は残る
function enterSquare(s: GameState, events: GameEvent[], sq: Square): void {
  const p = s.board[idx(sq)];
  if (!p || p.kind === 'OU') return;
  const t = s.traps
    .filter(t => t.owner !== p.side && t.at && sameSq(t.at, sq) && t.cardId && CARDS[t.cardId].trap?.trigger === 'enter')
    .sort((a, b) => a.uid - b.uid)[0];
  if (!t) return;
  fireTrap(s, events, t);
  destroyAt(s, events, sq, t.cardId!);
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
  if (def.kind === 'magic') {
    // 鏡の結界：効果の前に無効にする。使った側の手番はそのまま終わる
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
  if (s.frozen === mover) s.frozen = null;
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
    // 指せる行動が1つもない（凍てつく盤で囲まれた王だけ、など）ときは、手番を自動で相手へ回す
    events.push({ type: 'passed', side: s.turn });
    endTurn(s, events);
  }
}

// 行動が1つでもあるか（駒の移動はすぐ見つかることが多いので先に調べる）
function hasAnyAction(s: GameState): boolean {
  const frozen = s.frozen === s.turn;
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== s.turn) continue;
    if (pieceTargets(s, sqOf(i)).some(to => !(frozen && s.board[idx(to)]))) return true;
  }
  return legalActions(s).length > 0;
}
