// タップ → 行動の変換（DOM も three も使わない純粋な計算）
// 出す行動は、必ず legal 配列の要素そのもの。ここで行動を組み立てない
import type { Action, GameState, HandKind, Square } from '../rules/types';
import { idx, sameSq } from '../rules/board';
import { pieceTargets } from '../rules/moves';
import { CARDS } from '../cards';

export type InputState =
  | { mode: 'idle' }
  | { mode: 'piece'; from: Square }
  | { mode: 'drop'; kind: HandKind }
  // 成る／成らないを聞いている。韋駄天の2回目の成りを聞くときは second と、1回目の成り（promote）が入る
  | { mode: 'promote'; from: Square; to: Square; second?: Square; promote?: boolean }
  | { mode: 'second'; from: Square; to: Square; promote: boolean }   // 韋駄天の2回目を選ぶか止めるか
  | { mode: 'card'; uid: number; picked: Square[] }
  | { mode: 'pick'; uid: number };                                   // 呼び戻す駒の種類を選ぶ

export type InputEvent =
  | { type: 'square'; sq: Square } | { type: 'hand'; kind: HandKind } | { type: 'useCard'; uid: number }
  | { type: 'promote'; yes: boolean } | { type: 'pick'; kind: HandKind } | { type: 'stop' } | { type: 'cancel' };

export interface Highlight { sq: Square; kind: 'move' | 'equipMove' | 'capture' | 'target' | 'selected' }

export interface InputResult {
  state: InputState;
  action?: Action;
  highlights: Highlight[];
  prompt?: string;            // 案内の帯に出す文
  choices?: HandKind[];       // mode 'pick' のときの選択肢
  confirm?: boolean;          // 札の対象をここで決められる（もっと選ぶこともできる）とき「これで決める」を出す
}

type MoveAction = Extract<Action, { type: 'move' }>;
type DropAction = Extract<Action, { type: 'drop' }>;
type CardAction = Extract<Action, { type: 'card' }>;

const IDLE: InputState = { mode: 'idle' };

/** 浮かせて見せる駒のマス：盤の駒を選んで、行き先を待っているときだけ（成るかを聞く間は下ろしておく） */
export function liftedSquare(st: InputState): Square | null {
  return st.mode === 'piece' ? st.from : null;
}
const PROMPT_PROMOTE = '成りますか？';
const PROMPT_SECOND = 'もう1回動かせます（動かさなくても終われます）';
const PROMPT_MORE = 'もう1つ選べます（このままでも使えます）';

const moveActions = (legal: Action[]) => legal.filter((a): a is MoveAction => a.type === 'move');
const dropActions = (legal: Action[]) => legal.filter((a): a is DropAction => a.type === 'drop');
const cardActions = (legal: Action[], uid: number) =>
  legal.filter((a): a is CardAction => a.type === 'card' && a.uid === uid);

export function cardUsable(legal: Action[], uid: number): boolean {
  return legal.some(a => a.type === 'card' && a.uid === uid);
}

// 2つの対象が、順番を問わず同じ組か
function sameSet(a: Square[], b: Square[]): boolean {
  return a.length === b.length && a.every(x => b.some(y => sameSq(x, y)));
}

function uniqueSquares(list: Square[]): Square[] {
  const out: Square[] = [];
  for (const s of list) if (!out.some(o => sameSq(o, s))) out.push(s);
  return out;
}

function cardIdOf(view: GameState, uid: number) {
  return view.players[view.turn].cards.find(c => c.uid === uid)?.cardId;
}

// 光っていないマスをタップしたとき：自分の動かせる駒なら選び直し、それ以外は何もない状態へ
function fallback(view: GameState, legal: Action[], at: Square): InputResult {
  const p = view.board[idx(at)];
  if (p && p.side === view.turn && moveActions(legal).some(a => sameSq(a.from, at))) {
    return render(view, legal, { mode: 'piece', from: at });
  }
  return render(view, legal, IDLE);
}

function done(view: GameState, legal: Action[], action: Action): InputResult {
  return { ...render(view, legal, IDLE), action };
}

// 1回目の動き（from → to、成り promote）が決まったあと：韋駄天の2回目があるか
function afterFirst(view: GameState, legal: Action[], from: Square, to: Square, promote: boolean): InputResult {
  const list = moveActions(legal).filter(a => sameSq(a.from, from) && sameSq(a.to, to) && a.promote === promote);
  if (list.some(a => a.second)) return render(view, legal, { mode: 'second', from, to, promote });
  return done(view, legal, list.find(a => !a.second) ?? list[0]);
}

function pieceTap(view: GameState, legal: Action[], from: Square, at: Square): InputResult {
  const cands = moveActions(legal).filter(a => sameSq(a.from, from) && sameSq(a.to, at));
  if (cands.length === 0) return fallback(view, legal, at);
  const options = [...new Set(cands.map(a => a.promote))];
  if (options.length > 1) return render(view, legal, { mode: 'promote', from, to: at });
  return afterFirst(view, legal, from, at, options[0]);
}

function secondTap(view: GameState, legal: Action[], st: Extract<InputState, { mode: 'second' }>, at: Square): InputResult {
  const cands = moveActions(legal).filter(a =>
    sameSq(a.from, st.from) && sameSq(a.to, st.to) && a.promote === st.promote && a.second && sameSq(a.second.to, at));
  if (cands.length === 0) return fallback(view, legal, at);
  const options = [...new Set(cands.map(a => a.second!.promote))];
  if (options.length > 1) {
    return render(view, legal, { mode: 'promote', from: st.from, to: st.to, second: at, promote: st.promote });
  }
  return done(view, legal, cands[0]);
}

function promoteAnswer(view: GameState, legal: Action[], st: Extract<InputState, { mode: 'promote' }>, yes: boolean): InputResult {
  if (st.second) {
    const found = moveActions(legal).find(a =>
      sameSq(a.from, st.from) && sameSq(a.to, st.to) && a.promote === st.promote
      && a.second && sameSq(a.second.to, st.second!) && a.second.promote === yes);
    return found ? done(view, legal, found) : render(view, legal, IDLE);
  }
  return afterFirst(view, legal, st.from, st.to, yes);
}

function stopSecond(view: GameState, legal: Action[], st: Extract<InputState, { mode: 'second' }>): InputResult {
  const found = moveActions(legal).find(a =>
    sameSq(a.from, st.from) && sameSq(a.to, st.to) && a.promote === st.promote && !a.second);
  return found ? done(view, legal, found) : render(view, legal, IDLE);
}

function handTap(view: GameState, legal: Action[], st: InputState, kind: HandKind): InputResult {
  if (st.mode === 'drop' && st.kind === kind) return render(view, legal, IDLE);
  if (dropActions(legal).some(a => a.kind === kind)) return render(view, legal, { mode: 'drop', kind });
  return render(view, legal, IDLE);
}

function dropTap(view: GameState, legal: Action[], kind: HandKind, at: Square): InputResult {
  const a = dropActions(legal).find(d => d.kind === kind && sameSq(d.to, at));
  return a ? done(view, legal, a) : fallback(view, legal, at);
}

function useCard(view: GameState, legal: Action[], st: InputState, uid: number): InputResult {
  // 同じカードをもう一度タップしたら選びを取りやめる
  if ((st.mode === 'card' || st.mode === 'pick') && st.uid === uid) return render(view, legal, IDLE);
  const acts = cardActions(legal, uid);
  if (acts.length === 0) return render(view, legal, IDLE);
  const def = CARDS[cardIdOf(view, uid)!];
  if (def.choices) return render(view, legal, { mode: 'pick', uid });
  if (acts.some(a => a.targets.length === 0)) return done(view, legal, acts.find(a => a.targets.length === 0)!);
  return render(view, legal, { mode: 'card', uid, picked: [] });
}

function cardTap(view: GameState, legal: Action[], st: Extract<InputState, { mode: 'card' }>, at: Square): InputResult {
  // 選び済みのマスをもう一度タップしたら外す
  if (st.picked.some(p => sameSq(p, at))) {
    return render(view, legal, { mode: 'card', uid: st.uid, picked: st.picked.filter(p => !sameSq(p, at)) });
  }
  const acts = cardActions(legal, st.uid).filter(a => st.picked.every(p => a.targets.some(t => sameSq(t, p))));
  const hit = acts.filter(a => a.targets.some(t => sameSq(t, at)));
  if (hit.length === 0) return fallback(view, legal, at);
  const picked = [...st.picked, at];
  const full = hit.find(a => sameSet(a.targets, picked));
  // もっと多く選べる組が無ければ、ここで使う（成り上がりは2つ目も選べるので待つ）
  if (full && !hit.some(a => a.targets.length > picked.length)) return done(view, legal, full);
  return render(view, legal, { mode: 'card', uid: st.uid, picked });
}

// 札の対象を選びかけで、今選んでいる組そのままで使える行動
function cardFull(legal: Action[], st: Extract<InputState, { mode: 'card' }>): CardAction | undefined {
  if (st.picked.length === 0) return undefined;
  return cardActions(legal, st.uid).find(a => sameSet(a.targets, st.picked));
}

export function reduceInput(view: GameState, legal: Action[], st: InputState, ev: InputEvent): InputResult {
  if (ev.type === 'cancel') return render(view, legal, IDLE);
  switch (ev.type) {
    case 'square':
      switch (st.mode) {
        case 'idle': return fallback(view, legal, ev.sq);
        case 'piece': return pieceTap(view, legal, st.from, ev.sq);
        case 'drop': return dropTap(view, legal, st.kind, ev.sq);
        case 'card': return cardTap(view, legal, st, ev.sq);
        case 'second': return secondTap(view, legal, st, ev.sq);
        default: return render(view, legal, st);   // 成る/成らない・種類選びの最中は盤をタップしても動かない
      }
    case 'hand':
      if (st.mode === 'promote' || st.mode === 'second' || st.mode === 'pick') return render(view, legal, st);
      return handTap(view, legal, st, ev.kind);
    case 'useCard':
      if (st.mode === 'promote' || st.mode === 'second') return render(view, legal, st);
      return useCard(view, legal, st, ev.uid);
    case 'promote':
      return st.mode === 'promote' ? promoteAnswer(view, legal, st, ev.yes) : render(view, legal, st);
    case 'stop': {
      if (st.mode === 'second') return stopSecond(view, legal, st);
      const full = st.mode === 'card' ? cardFull(legal, st) : undefined;
      return full ? done(view, legal, full) : render(view, legal, st);
    }
    case 'pick': {
      if (st.mode !== 'pick') return render(view, legal, st);
      const a = cardActions(legal, st.uid).find(c => c.pick === ev.kind);
      return a ? done(view, legal, a) : render(view, legal, st);
    }
  }
}

// 状態から、光らせるマス・案内の文・選択肢を出す
function render(view: GameState, legal: Action[], st: InputState): InputResult {
  const highlights: Highlight[] = [];
  let prompt: string | undefined;
  let choices: HandKind[] | undefined;
  let confirm: boolean | undefined;

  switch (st.mode) {
    case 'idle': break;
    case 'piece': {
      highlights.push({ sq: st.from, kind: 'selected' });
      // 装備を外した局面で動けるマス（これに入らないものが装備で増えたマス）
      const piece = view.board[idx(st.from)];
      const bare = new Set<number>();
      if (piece?.equip) {
        const board = [...view.board];
        board[idx(st.from)] = { ...piece, equip: null };
        for (const t of pieceTargets({ ...view, board }, st.from)) bare.add(idx(t));
      }
      const targets = uniqueSquares(moveActions(legal).filter(a => sameSq(a.from, st.from)).map(a => a.to));
      for (const to of targets) {
        const q = view.board[idx(to)];
        let kind: Highlight['kind'] = 'move';
        if (q && q.side !== view.turn) kind = 'capture';
        else if (piece?.equip && !bare.has(idx(to))) kind = 'equipMove';
        highlights.push({ sq: to, kind });
      }
      break;
    }
    case 'drop':
      for (const a of dropActions(legal)) if (a.kind === st.kind) highlights.push({ sq: a.to, kind: 'target' });
      break;
    case 'promote':
      highlights.push({ sq: st.second ?? st.to, kind: 'selected' });
      prompt = PROMPT_PROMOTE;
      break;
    case 'second': {
      highlights.push({ sq: st.to, kind: 'selected' });
      const seconds = moveActions(legal).filter(a =>
        sameSq(a.from, st.from) && sameSq(a.to, st.to) && a.promote === st.promote && a.second);
      for (const to of uniqueSquares(seconds.map(a => a.second!.to))) highlights.push({ sq: to, kind: 'move' });
      prompt = PROMPT_SECOND;
      break;
    }
    case 'card': {
      const id = cardIdOf(view, st.uid);
      prompt = id ? CARDS[id].prompt : undefined;
      const acts = cardActions(legal, st.uid).filter(a => st.picked.every(p => a.targets.some(t => sameSq(t, p))));
      for (const p of st.picked) highlights.push({ sq: p, kind: 'selected' });
      const rest = acts.flatMap(a => a.targets).filter(t => !st.picked.some(p => sameSq(p, t)));
      for (const t of uniqueSquares(rest)) highlights.push({ sq: t, kind: 'target' });
      if (cardFull(legal, st)) { confirm = true; prompt = PROMPT_MORE; }
      break;
    }
    case 'pick': {
      const id = cardIdOf(view, st.uid);
      prompt = id ? CARDS[id].prompt : undefined;
      choices = [...new Set(cardActions(legal, st.uid).flatMap(a => (a.pick ? [a.pick] : [])))];
      break;
    }
  }
  return { state: st, highlights, prompt, choices, confirm };
}
