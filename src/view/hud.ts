// 対局画面の HTML 部分：上下の帯（持ち駒・伏せ札・手番）・手札・説明の板・案内の帯・成る/成らない・駒の種類選び。
// 局面を描き直すだけで、行動は組み立てない（押されたことを on で知らせるだけ）。
import type { CardId, GameState, HandKind, Side } from '../rules/types';
import type { Level } from '../ai/levels';
import { CARDS } from '../cards';
import { KIND_MARK, cardHtml } from './cardArt';

type HudEvent = 'hand' | 'card' | 'use' | 'promote' | 'pick' | 'stop' | 'cancel';

export interface Hud {
  /** 帯・駒台・伏せ札・手札を描き直す。usable は今使えるカードの uid（なければ全部使えない扱い） */
  render(view: GameState, me: Side, opts: { thinking: boolean; level: Level; keiko?: boolean; usable?: Set<number> }): void;
  setPrompt(text: string | null, opts?: { stop?: boolean; choices?: HandKind[] }): void;
  askPromote(): void;          // 成る／成らないの2つのボタン
  on(ev: HudEvent, fn: (arg?: unknown) => void): void;
  lock(locked: boolean): void; // 演出中・思考中は押せない見た目にする
  /** 選んでいる持ち駒・カードを目立たせる（選んでいなければ null） */
  select(sel: { hand?: HandKind | null; card?: number | null }): void;
  /** カードの説明の板を開く。usable が false なら「使う」を押せなくする */
  showDetail(uid: number, usable: boolean): void;
  hideDetail(): void;
  /** 駒台の箱の画面上の四角（取った駒を飛ばす先）。見えていなければ null */
  komadaiRect(side: 'me' | 'foe'): DOMRect | null;
  root: HTMLElement;
  board: HTMLElement;          // 3D の盤を置く場所
}

const LEVEL_LABEL: Record<Level, string> = { weak: '弱い', normal: 'ふつう', strong: '強い' };
const HAND_ORDER: HandKind[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];
export const HAND_LABEL: Record<HandKind, string> = { HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩' };
const TRAP_SLOTS = 3;
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 枚数を漢数字にする（1〜18 くらいまで） */
export function kansuji(n: number): string {
  if (n < 10) return DIGITS[n] ?? String(n);
  const tens = Math.floor(n / 10);
  return `${tens === 1 ? '' : DIGITS[tens]}十${DIGITS[n % 10]}`;
}

/**
 * 駒台で「ポン」と収める持ち駒の種類：前の描き直しより増えた種類と、描き直しの直前にまだ「ポン」の途中だった種類（still）。
 * still があるのは、CPU に取られた直後にすぐ次の描き直しが来ても、動きを消さないため。前がなければ still だけ
 */
export function arrivedKinds(
  prev: Record<HandKind, number> | null, next: Record<HandKind, number>, still: HandKind[] = [],
): HandKind[] {
  return HAND_ORDER.filter((k) => next[k] > 0 && ((prev !== null && next[k] > prev[k]) || still.includes(k)));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls: string, text: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

export function createHud(root: HTMLElement): Hud {
  const handlers = new Map<HudEvent, ((arg?: unknown) => void)[]>();
  const emit = (ev: HudEvent, arg?: unknown): void => { for (const fn of handlers.get(ev) ?? []) fn(arg); };

  let last: { view: GameState; me: Side } | null = null;
  let sel: { hand: HandKind | null; card: number | null } = { hand: null, card: null };
  let detailUid: number | null = null;

  // ---- 上の帯（相手） ----
  const foe = el('header', 'side foe');
  const foeRow = el('div', 'row');
  const foeWho = el('div', 'who');
  const foeName = el('span', 'name');
  const thinking = el('span', 'thinking');
  thinking.setAttribute('aria-live', 'polite');
  foeWho.append(el('span', 'seal', '敵'), foeName, thinking);
  const foeTraps = el('div', 'traps');
  foeTraps.setAttribute('aria-label', '相手の伏せ札');
  const restBtn = button('rest-open', '残り札');
  foeRow.append(foeWho, foeTraps, restBtn);
  const foeHands = el('div', 'komadai foe');
  foeHands.setAttribute('aria-label', '相手の持ち駒');
  foe.append(foeRow, foeHands);

  // ---- 盤の場所 ----
  const board = el('div', 'board-area');
  // 案内の短冊は、盤にかぶらないよう下の駒台（自分の帯）に貼る
  const prompt = el('div', 'prompt');
  prompt.hidden = true;
  prompt.setAttribute('role', 'status');

  // ---- 下の帯（自分）と手札 ----
  const footer = el('footer', 'mine-area');
  const me = el('div', 'side me');
  const meRow = el('div', 'row');
  const meWho = el('div', 'who');
  const meTurn = el('span');
  const meSeal = el('span', 'seal', '自');
  meWho.append(meSeal, meTurn);
  const meTraps = el('div', 'traps');
  meTraps.setAttribute('aria-label', '自分の伏せ札');
  meRow.append(meWho, meTraps);
  const meHands = el('div', 'komadai me');
  meHands.setAttribute('aria-label', '自分の持ち駒');
  me.append(meHands, meRow);
  const hand = el('div', 'hand');
  hand.setAttribute('aria-label', '手札');

  // ---- カードの説明の板 ----
  const detail = el('div', 'detail');
  detail.hidden = true;
  detail.setAttribute('role', 'dialog');
  const dHead = el('div', 'dhead');
  const dName = el('b', 'dname');
  const dMeta = el('span', 'dmeta');
  dHead.append(dName, dMeta);
  const dText = el('p', 'dtext');
  const dNote = el('p', 'dnote', '今は使えません');
  const dBtns = el('div', 'dbtns');
  const useBtn = button('use', '使う');
  const dCancel = button('cancel', 'やめる');
  dBtns.append(useBtn, dCancel);
  detail.append(dHead, dText, dNote, dBtns);
  footer.append(detail, me, hand, prompt);

  // ---- 相手の残り札の板 ----
  const rest = el('div', 'rest');
  rest.hidden = true;
  rest.setAttribute('role', 'dialog');
  rest.setAttribute('aria-modal', 'true');
  rest.setAttribute('aria-label', '相手の残り札');
  const restBox = el('div', 'rest-box');
  const restTitle = el('b', 'rest-title', '相手の残り札');
  const restList = el('div', 'rest-list');
  const restClose = button('rest-close', '閉じる');
  restBox.append(restTitle, restList, restClose);
  rest.append(restBox);

  root.append(foe, board, footer, rest);

  // ---- 押されたとき ----
  restBtn.addEventListener('click', () => {
    if (!last) return;
    const foeSide: Side = last.me === 'sente' ? 'gote' : 'sente';
    const left = last.view.players[foeSide].cards.filter(c => !c.used);
    restList.replaceChildren();
    if (left.length === 0) restList.append(el('p', 'rest-none', '残りの札はありません'));
    for (const c of left) {
      const fig = el('figure', 'rest-card');
      fig.innerHTML = cardHtml(c.cardId, { size: 'small' }); // 定数だけでできた文字列
      fig.append(el('figcaption', '', CARDS[c.cardId].name));
      restList.append(fig);
    }
    rest.hidden = false;
    restClose.focus();
  });
  const closeRest = (): void => { rest.hidden = true; restBtn.focus(); };
  restClose.addEventListener('click', closeRest);
  rest.addEventListener('click', (e) => { if (e.target === rest) closeRest(); });

  useBtn.addEventListener('click', () => {
    if (detailUid === null || useBtn.disabled) return;
    const uid = detailUid;
    hud.hideDetail();
    emit('use', uid);
  });
  dCancel.addEventListener('click', () => {
    hud.hideDetail();
    emit('cancel');
  });

  function trapSlots(box: HTMLElement, view: GameState, owner: Side, mine: boolean): void {
    box.replaceChildren();
    const traps = view.traps.filter(t => t.owner === owner);
    for (let i = 0; i < TRAP_SLOTS; i++) {
      const t = traps[i];
      const s = el('i', 'slot');
      if (t && mine && t.cardId) {
        s.classList.add('mine');
        s.textContent = CARDS[t.cardId].name[0];
        s.title = CARDS[t.cardId].name;
        s.setAttribute('aria-label', `伏せた${CARDS[t.cardId].name}`);
      } else if (t) {
        s.classList.add('back');
        s.setAttribute('aria-label', '伏せ札');
      } else {
        s.setAttribute('aria-label', '空き');
      }
      box.append(s);
    }
  }

  function komadai(box: HTMLElement, view: GameState, side: Side, mine: boolean, prev: GameState | null): void {
    // まだ「ポン」の途中の駒（描き直しで消さずに、新しい駒で続ける）
    const still = [...box.querySelectorAll<HTMLElement>('.koma.arrive')]
      .filter((t) => t.getAnimations?.().some((a) => a.playState === 'running'))
      .map((t) => t.dataset.kind as HandKind);
    const arrived = new Set(arrivedKinds(prev ? prev.players[side].hand : null, view.players[side].hand, still));
    box.replaceChildren();
    const h = view.players[side].hand;
    const kinds = HAND_ORDER.filter(k => h[k] > 0);
    if (kinds.length === 0) { box.append(el('span', 'none', '持ち駒なし')); return; }
    for (const k of kinds) {
      const n = h[k];
      const label = `${HAND_LABEL[k]}${n > 1 ? ` ${kansuji(n)}` : ''}`;
      const token = mine ? button('koma', '') : el('span', 'koma');
      token.append(el('span', 'face', HAND_LABEL[k]));
      if (n > 1) token.append(el('span', 'num', kansuji(n)));
      token.dataset.kind = k;
      if (arrived.has(k)) token.classList.add('arrive');
      token.setAttribute('aria-label', mine ? `持ち駒の${label}を打つ` : `相手の持ち駒 ${label}`);
      if (mine) {
        token.dataset.kind = k;
        if (sel.hand === k) token.classList.add('sel');
        token.addEventListener('click', () => emit('hand', k));
      }
      box.append(token);
    }
  }

  function handCards(view: GameState, side: Side, usable: Set<number>): void {
    hand.replaceChildren();
    const cards = view.players[side].cards.filter(c => !c.used);
    if (cards.length === 0) { hand.append(el('p', 'none', '手札はありません')); return; }
    for (const c of cards) {
      const wrap = el('div');
      wrap.innerHTML = cardHtml(c.cardId); // 定数だけでできた文字列
      const card = wrap.firstElementChild as HTMLElement;
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.dataset.uid = String(c.uid);
      if (!usable.has(c.uid)) card.classList.add('off');
      if (sel.card === c.uid) card.classList.add('sel');
      const tap = (): void => emit('card', c.uid);
      card.addEventListener('click', tap);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
      });
      hand.append(card);
    }
  }

  function cardOf(uid: number): CardId | undefined {
    if (!last) return undefined;
    return last.view.players[last.me].cards.find(c => c.uid === uid)?.cardId;
  }

  const hud: Hud = {
    root,
    board,
    render(view, side, opts) {
      // 同じ側から見た続きのときだけ、増えた持ち駒に「ポン」を付ける
      const prev = last && last.me === side ? last.view : null;
      last = { view, me: side };
      const foeSide: Side = side === 'sente' ? 'gote' : 'sente';
      foeName.textContent = `CPU・${opts.keiko ? '稽古・' : ''}${LEVEL_LABEL[opts.level]}`;
      thinking.textContent = opts.thinking ? '考え中' : '';
      const myTurn = view.turn === side && !opts.thinking && !view.result;
      meTurn.textContent = myTurn ? 'あなたの手番' : '相手の手番';
      // 判子：自分の手番は朱の「自」、相手の手番は藍の枠の「敵」（決着のあとは「自」のまま）
      const foeTurn = !myTurn && !view.result;
      meSeal.textContent = foeTurn ? '敵' : '自';
      me.classList.toggle('turn', myTurn);
      me.classList.toggle('foe-turn', foeTurn);
      trapSlots(foeTraps, view, foeSide, false);
      trapSlots(meTraps, view, side, true);
      komadai(foeHands, view, foeSide, false, prev);
      komadai(meHands, view, side, true, prev);
      handCards(view, side, opts.usable ?? new Set());
      const left = view.players[foeSide].cards.filter(c => !c.used).length;
      restBtn.setAttribute('aria-label', `相手の残り札（${left}枚）を見る`);
    },
    setPrompt(text, opts = {}) {
      prompt.replaceChildren();
      if (text === null) { prompt.hidden = true; return; }
      prompt.append(el('span', 'ptext', text));
      const btns = el('span', 'pbtns');
      for (const k of opts.choices ?? []) {
        const b = button('choice', HAND_LABEL[k]);
        b.setAttribute('aria-label', `${HAND_LABEL[k]}を呼び戻す`);
        b.addEventListener('click', () => emit('pick', k));
        btns.append(b);
      }
      if (opts.stop) {
        const b = button('stop', 'ここで止める');
        b.addEventListener('click', () => emit('stop'));
        btns.append(b);
      }
      const c = button('pcancel', 'やめる');
      c.addEventListener('click', () => emit('cancel'));
      btns.append(c);
      prompt.append(btns);
      prompt.hidden = false;
    },
    askPromote() {
      prompt.replaceChildren();
      prompt.append(el('span', 'ptext', '成りますか？'));
      const btns = el('span', 'pbtns');
      const yes = button('promote yes', '成る');
      const no = button('promote', '成らない');
      const c = button('pcancel', 'やめる');
      yes.addEventListener('click', () => emit('promote', true));
      no.addEventListener('click', () => emit('promote', false));
      c.addEventListener('click', () => emit('cancel'));
      btns.append(yes, no, c);
      prompt.append(btns);
      prompt.hidden = false;
      yes.focus();
    },
    on(ev, fn) {
      const list = handlers.get(ev) ?? [];
      list.push(fn);
      handlers.set(ev, list);
    },
    lock(locked) {
      root.classList.toggle('locked', locked);
      if (locked) hud.hideDetail();
    },
    select(s) {
      sel = { hand: s.hand ?? null, card: s.card ?? null };
      for (const t of meHands.querySelectorAll<HTMLElement>('.koma')) {
        t.classList.toggle('sel', t.dataset.kind === sel.hand);
      }
      for (const c of hand.querySelectorAll<HTMLElement>('.card')) {
        c.classList.toggle('sel', Number(c.dataset.uid) === sel.card);
      }
    },
    showDetail(uid, usable) {
      const id = cardOf(uid);
      if (!id) return;
      const c = CARDS[id];
      const k = KIND_MARK[c.kind];
      detailUid = uid;
      detail.className = `detail ${k.color}`;
      dName.textContent = c.name;
      dMeta.textContent = `${k.label}・コスト${c.cost}`;
      dText.textContent = c.text;
      dNote.hidden = usable;
      useBtn.disabled = !usable;
      detail.hidden = false;
      hud.select({ card: uid });
      (usable ? useBtn : dCancel).focus();
    },
    komadaiRect(side) {
      const r = (side === 'me' ? meHands : foeHands).getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    },
    hideDetail() {
      if (detail.hidden) return;
      detail.hidden = true;
      detailUid = null;
      if (sel.card !== null) hud.select({ hand: sel.hand });
    },
  };
  return hud;
}
