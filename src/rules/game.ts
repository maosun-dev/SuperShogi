// 対局の進行：行動を受け取り、新しい局面と出来事の記録を返す
import type { Action, CardId, CardInstance, GameEvent, GameState, HandKind, Piece, Side, Square } from './types';
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
    for (const to of pieceTargets(s, from)) {
      // 凍てつく盤：この手番は相手の駒のマスへ動けない
      if (frozen && s.board[idx(to)]) continue;
      for (const promote of promoteOptions(p, from, to)) {
        out.push({ type: 'move', from, to, promote });
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
  const s = cloneState(s0);
  const events: GameEvent[] = [];
  const side = s.turn;

  if (a.type === 'move') {
    const p = s.board[idx(a.from)]!;
    const target = s.board[idx(a.to)];
    if (target) {
      // 取る：成りを戻して取った側の持ち駒へ
      events.push({ type: 'captured', pieceId: target.id, at: a.to, by: side });
      if (target.kind !== 'OU') s.players[side].hand[target.kind as HandKind]++;
    }
    s.board[idx(a.from)] = null;
    s.board[idx(a.to)] = p;
    if (a.promote) p.promoted = true;
    events.push({ type: 'moved', pieceId: p.id, from: a.from, to: a.to, promoted: a.promote });
    if (target?.kind === 'OU') {
      finish(s, events, { winner: side, reason: 'king-captured' });
      return { state: s, events };
    }
  } else if (a.type === 'drop') {
    const p: Piece = { id: s.nextId++, kind: a.kind, side, promoted: false, equip: null };
    s.players[side].hand[a.kind]--;
    s.board[idx(a.to)] = p;
    events.push({ type: 'dropped', pieceId: p.id, side, kind: a.kind, to: a.to });
  } else {
    const inst = s.players[side].cards.find(c => c.uid === a.uid)!;
    useCard(s, events, side, inst, a.targets, a.pick);
  }

  endTurn(s, events);
  return { state: s, events };
}

function cardContext(s: GameState, events: GameEvent[], side: Side): CardContext {
  return {
    state: s,
    side,
    emit: e => { events.push(e); },
    destroy(sq, cause) {
      const p = s.board[idx(sq)];
      if (!p) return;
      s.board[idx(sq)] = null;
      events.push({ type: 'destroyed', pieceId: p.id, at: sq, cause });
    },
    relocate(from, to) {
      s.board[idx(to)] = s.board[idx(from)];
      s.board[idx(from)] = null;
    },
    swap(a, b) {
      const pa = s.board[idx(a)];
      s.board[idx(a)] = s.board[idx(b)];
      s.board[idx(b)] = pa;
    },
  };
}

function useCard(
  s: GameState, events: GameEvent[], side: Side, inst: CardInstance, targets: Square[], pick?: HandKind,
): void {
  const def = CARDS[inst.cardId];
  inst.used = true;
  events.push({ type: 'cardUsed', side, cardId: inst.cardId, targets });
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
  }
}
