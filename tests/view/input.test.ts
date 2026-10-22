// タップ → 行動の変換テスト（Node で動く純粋な計算）
import { describe, expect, it } from 'vitest';
import { reduceInput, cardUsable, type InputState, type InputEvent } from '../../src/view/input';
import { legalActions, createGame } from '../../src/rules/game';
import { CARDS } from '../../src/cards';
import type { Action, CardId, GameState, Square } from '../../src/rules/types';
import { emptyState, put, giveCard } from '../helpers';

const sq = (c: number, r: number): Square => ({ c, r });
const IDLE: InputState = { mode: 'idle' };

// 同じ局面では同じ legal 配列を使う（toBe で同じ物か比べるため）
const legalCache = new WeakMap<GameState, Action[]>();
function legalOf(s: GameState): Action[] {
  let l = legalCache.get(s);
  if (!l) { l = legalActions(s); legalCache.set(s, l); }
  return l;
}

// イベントを順に流し、最後の結果と legal を返す
function run(s: GameState, evs: InputEvent[]) {
  const legal = legalOf(s);
  let st: InputState = IDLE;
  let res = reduceInput(s, legal, st, { type: 'cancel' });
  for (const ev of evs) {
    res = reduceInput(s, legal, st, ev);
    st = res.state;
  }
  return { res, legal };
}
const tap = (c: number, r: number): InputEvent => ({ type: 'square', sq: sq(c, r) });
const has = (res: { highlights: { sq: Square; kind: string }[] }, c: number, r: number, kind: string) =>
  res.highlights.some(h => h.sq.c === c && h.sq.r === r && h.kind === kind);

function kings(s: GameState) {
  put(s, sq(4, 8), 'OU', 'sente');
  put(s, sq(4, 0), 'OU', 'gote');
}

describe('input', () => {
  it('駒を選ぶと動けるマスが光り、そこをタップすると行動になる', () => {
    const s = createGame({ sente: [], gote: [] });
    const { res: r1 } = run(s, [tap(2, 6)]);
    expect(r1.state).toEqual({ mode: 'piece', from: sq(2, 6) });
    expect(r1.highlights.filter(h => h.kind === 'move')).toHaveLength(1);
    expect(has(r1, 2, 5, 'move')).toBe(true);
    const { res, legal } = run(s, [tap(2, 6), tap(2, 5)]);
    const want = legal.find(a => a.type === 'move' && a.from.c === 2 && a.from.r === 6 && a.to.r === 5)!;
    expect(res.action).toBe(want);
    expect(res.state.mode).toBe('idle');
  });

  it('天馬の蹄で増えたマスは equipMove', () => {
    const s = emptyState();
    kings(s);
    put(s, sq(4, 6), 'KI', 'sente', { equip: 'tenma' });
    const { res } = run(s, [tap(4, 6)]);
    expect(has(res, 3, 4, 'equipMove')).toBe(true);
    expect(has(res, 5, 4, 'equipMove')).toBe(true);
    expect(has(res, 4, 5, 'move')).toBe(true);
  });

  it('相手の駒のマスは capture', () => {
    const s = emptyState();
    kings(s);
    put(s, sq(4, 6), 'FU', 'sente');
    put(s, sq(4, 5), 'FU', 'gote');
    const { res } = run(s, [tap(4, 6)]);
    expect(has(res, 4, 5, 'capture')).toBe(true);
  });

  it('成れるときは聞く／必ず成るときは聞かない', () => {
    const s = emptyState();
    kings(s);
    put(s, sq(2, 3), 'GI', 'sente');
    put(s, sq(0, 1), 'FU', 'sente');
    const { res } = run(s, [tap(2, 3), tap(2, 2)]);
    expect(res.state).toEqual({ mode: 'promote', from: sq(2, 3), to: sq(2, 2) });
    expect(res.prompt).toBe('成りますか？');
    const { res: no, legal } = run(s, [tap(2, 3), tap(2, 2), { type: 'promote', yes: false }]);
    const want = legal.find(a => a.type === 'move' && a.from.c === 2 && a.from.r === 3 && a.to.c === 2 && a.to.r === 2 && !a.promote && !a.second)!;
    expect(no.action).toBe(want);
    const { res: forced, legal: l2 } = run(s, [tap(0, 1), tap(0, 0)]);
    const w2 = l2.find(a => a.type === 'move' && a.from.c === 0 && a.from.r === 1 && a.to.r === 0)!;
    expect(w2.type === 'move' && w2.promote).toBe(true);
    expect(forced.action).toBe(w2);
  });

  it('韋駄天：2回目を選ぶか止められる', () => {
    const s = emptyState();
    kings(s);
    put(s, sq(4, 6), 'KI', 'sente', { equip: 'idaten' });
    put(s, sq(4, 4), 'FU', 'gote');   // 2回目の先に相手の駒
    const { res } = run(s, [tap(4, 6), tap(4, 5)]);
    expect(res.state).toEqual({ mode: 'second', from: sq(4, 6), to: sq(4, 5), promote: false });
    expect(res.prompt).toBe('もう1回動かせます（動かさなくても終われます）');
    expect(res.highlights.some(h => h.sq.c === 4 && h.sq.r === 4 && h.kind !== 'selected')).toBe(false);
    expect(has(res, 3, 5, 'move')).toBe(true);
    const { res: stop, legal } = run(s, [tap(4, 6), tap(4, 5), { type: 'stop' }]);
    const w1 = legal.find(a => a.type === 'move' && a.from.r === 6 && a.to.r === 5 && a.to.c === 4 && !a.second)!;
    expect(stop.action).toBe(w1);
    const { res: sec } = run(s, [tap(4, 6), tap(4, 5), tap(3, 5)]);
    expect(sec.action).toBeDefined();
    expect(sec.action!.type === 'move' && sec.action!.second?.to).toEqual(sq(3, 5));
    expect(legal.includes(sec.action!)).toBe(true);
  });

  it('持ち駒を打つ', () => {
    const s = emptyState();
    kings(s);
    put(s, sq(0, 6), 'FU', 'sente');
    s.players.sente.hand.FU = 1;
    const { res, legal } = run(s, [{ type: 'hand', kind: 'FU' }]);
    expect(res.state).toEqual({ mode: 'drop', kind: 'FU' });
    expect(has(res, 0, 4, 'target')).toBe(false);
    expect(has(res, 1, 4, 'target')).toBe(true);
    const { res: d } = run(s, [{ type: 'hand', kind: 'FU' }, tap(1, 4)]);
    const want = legal.find(a => a.type === 'drop' && a.to.c === 1 && a.to.r === 4)!;
    expect(d.action).toBe(want);
  });

  it('入れ替えの術は順不同', () => {
    const s = emptyState();
    kings(s);
    put(s, sq(8, 8), 'KY', 'sente');
    put(s, sq(0, 8), 'KY', 'sente');
    const uid = giveCard(s, 'sente', 'irekae');
    const { res: r1 } = run(s, [{ type: 'useCard', uid }, tap(8, 8)]);
    expect(has(r1, 8, 8, 'selected')).toBe(true);
    expect(has(r1, 0, 8, 'target')).toBe(true);
    expect(r1.prompt).toBe(CARDS.irekae.prompt);
    const { res, legal } = run(s, [{ type: 'useCard', uid }, tap(8, 8), tap(0, 8)]);
    const want = legal.find(a => a.type === 'card' && a.uid === uid && a.targets[0].c === 0 && a.targets[1].c === 8)!;
    expect(want).toBeDefined();
    expect(res.action).toBe(want);
    // もう一度タップで外す
    const { res: off } = run(s, [{ type: 'useCard', uid }, tap(8, 8), tap(8, 8)]);
    expect(off.state).toEqual({ mode: 'card', uid, picked: [] });
  });

  it('対象なしのカードはすぐ使う／呼び戻しは種類を選ぶ', () => {
    const s = emptyState();
    kings(s);
    const u1 = giveCard(s, 'sente', 'kagami');
    const { res, legal } = run(s, [{ type: 'useCard', uid: u1 }]);
    expect(res.action).toBe(legal.find(a => a.type === 'card' && a.uid === u1)!);

    const s2 = emptyState();
    kings(s2);
    s2.players.gote.hand.FU = 1;
    s2.players.gote.hand.KA = 1;
    const u2 = giveCard(s2, 'sente', 'yobimodoshi');
    const { res: p, legal: l2 } = run(s2, [{ type: 'useCard', uid: u2 }]);
    expect(p.state).toEqual({ mode: 'pick', uid: u2 });
    expect([...p.choices!].sort()).toEqual(['FU', 'KA']);
    const { res: d } = run(s2, [{ type: 'useCard', uid: u2 }, { type: 'pick', kind: 'KA' }]);
    expect(d.action).toBe(l2.find(a => a.type === 'card' && a.uid === u2 && a.pick === 'KA')!);
  });

  it('使えないカード', () => {
    const s = emptyState();
    kings(s);
    const uid = giveCard(s, 'sente', 'rakurai');
    const legal = legalOf(s);
    expect(cardUsable(legal, uid)).toBe(false);
    const { res } = run(s, [{ type: 'useCard', uid }]);
    expect(res.state).toEqual({ mode: 'idle' });
    expect(res.action).toBeUndefined();
  });

  it('光っていないマスは、自分の駒なら選び直し、それ以外は idle', () => {
    const s = createGame({ sente: [], gote: [] });
    const { res } = run(s, [tap(2, 6), tap(3, 6)]);
    expect(res.state).toEqual({ mode: 'piece', from: sq(3, 6) });
    const { res: r2 } = run(s, [tap(2, 6), tap(4, 4)]);
    expect(r2.state).toEqual({ mode: 'idle' });
    const { res: r3 } = run(s, [tap(2, 6), { type: 'cancel' }]);
    expect(r3.state).toEqual({ mode: 'idle' });
  });

  it('どのカードも案内の文がある', () => {
    const want: Record<string, string> = {
      oshikaeshi: '押し戻す相手の駒を選んでください',
      irekae: '入れ替える自分の駒を2つ選んでください',
      rakurai: '壊す相手の駒を選んでください',
      yobimodoshi: '呼び戻す駒の種類を選んでください',
      otoshiana: '落とし穴を仕掛けるマスを選んでください',
      tenma: '纏札を付ける自分の駒を選んでください',
      hagane: '纏札を付ける自分の駒を選んでください',
      hikijin: '纏札を付ける自分の駒を選んでください',
      idaten: '纏札を付ける自分の駒を選んでください',
      itetsuku: '凍てつく床を仕掛けるマスを選んでください',
      kakuotoshi: '成りを戻す相手の駒を選んでください',
      shoryu: '成らせる自分の駒を選んでください',
      tsuranuki: '纏札を付ける自分の駒を選んでください',
      omori: '重りの枷を付ける相手の駒を選んでください',
    };
    for (const [id, text] of Object.entries(want)) expect(CARDS[id as CardId].prompt).toBe(text);
  });
});
