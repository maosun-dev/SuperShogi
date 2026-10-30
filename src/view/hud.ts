// 対局画面の HTML 部分：上下の帯（持ち駒・伏せ札・手番）・手札・説明の板・案内の帯・成る/成らない・駒の種類選び。
// 局面を描き直すだけで、行動は組み立てない（押されたことを on で知らせるだけ）。
import type { CardId, GameState, HandKind, Side } from '../rules/types';
import { LEVEL_NAME, type Level } from '../ai/levels';
import { CARDS } from '../cards';
import { SHORYU_POWER_MOVE, shoryuWait } from '../cards/magic';
import { KIND_MARK, cardHtml } from './cardArt';
import { createCardPanel } from './cardPanel';

type HudEvent = 'hand' | 'card' | 'use' | 'promote' | 'pick' | 'stop' | 'cancel';

export interface Hud {
  /** 帯・駒台・伏せ札・手札を描き直す。usable は今使えるカードの uid（なければ全部使えない扱い） */
  // foe：友との対局のときの相手の名前・判子・待っている間の一言（無ければ CPU）
  render(view: GameState, me: Side, opts: { thinking: boolean; level: Level; keiko?: boolean; usable?: Set<number>; foe?: FoeLabel }): void;
  setPrompt(text: string | null, opts?: { stop?: boolean; confirm?: boolean; choices?: HandKind[] }): void;
  askPromote(): void;          // 成る／成らないの2つのボタン
  on(ev: HudEvent, fn: (arg?: unknown) => void): void;
  lock(locked: boolean): void; // 演出中・思考中は押せない見た目にする（手札の説明は読める）
  /** 選んでいる持ち駒・カードを目立たせる（選んでいなければ null） */
  select(sel: { hand?: HandKind | null; card?: number | null }): void;
  /** カードの説明の板を開く。usable が false なら「使う」を押せなくする */
  showDetail(uid: number, usable: boolean): void;
  hideDetail(): void;
  /** 札の説明の場所（広い画面の左上）に、相手が使った札を出す */
  showFoeCard(id: CardId): void;
  /** 札の説明の場所を案内だけに戻す（待ったで盤を戻したとき） */
  clearFoeCard(): void;
  /** 駒台の箱の画面上の四角（取った駒を飛ばす先）。見えていなければ null */
  komadaiRect(side: 'me' | 'foe'): DOMRect | null;
  root: HTMLElement;
  board: HTMLElement;          // 3D の盤を置く場所
}

const HAND_ORDER: HandKind[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];
export const HAND_LABEL: Record<HandKind, string> = { HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩' };
const TRAP_SLOTS = 3;
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 枚数を漢数字にする（1〜18 くらいまで） */
/** 友との対局の相手の見せ方 */
export interface FoeLabel { name: string; seal: string; waiting: string }

export function kansuji(n: number): string {
  if (n < 10) return DIGITS[n] ?? String(n);
  const tens = Math.floor(n / 10);
  return `${tens === 1 ? '' : DIGITS[tens]}十${DIGITS[n % 10]}`;
}

/**
 * 相手の残り札の見せ方：術札・纏札は残っているものを表で。
 * 忍札は札見せで中身を見せているので、持ち込んだ全部を表で出す（覚えておかなくてよいように）。
 * 伏せた忍札は相手から見ると「使っていない」ままなので、どれを伏せたかは分からない。印が付くのは発動したものだけ
 */
export function restView(cards: { cardId: CardId; used: boolean }[]): { open: CardId[]; traps: { id: CardId; fired: boolean }[] } {
  const open = cards.filter(c => !c.used && CARDS[c.cardId].kind !== 'trap').map(c => c.cardId);
  const traps = cards.filter(c => CARDS[c.cardId].kind === 'trap').map(c => ({ id: c.cardId, fired: c.used }));
  return { open, traps };
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
  const foeSeal = el('span', 'seal', '敵');
  foeWho.append(foeSeal, foeName, thinking);
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
  // 札の絵（広い画面のときだけ見せる）
  const dArt = el('div', 'dart');
  dArt.setAttribute('aria-hidden', 'true'); // 札の名前は見出しで読むので、絵は読ませない
  const dHead = el('div', 'dhead');
  const dName = el('b', 'dname');
  const dMeta = el('span', 'dmeta');
  dHead.append(dName, dMeta);
  const dText = el('p', 'dtext');
  const dPower = el('p', 'dpower');
  const dNote = el('p', 'dnote', '今は使えません');
  const dBtns = el('div', 'dbtns');
  const useBtn = button('use', '使う');
  const dCancel = button('cancel', 'やめる');
  dBtns.append(useBtn, dCancel);
  detail.append(dArt, dHead, dText, dPower, dNote, dBtns);
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
  // 持ち込んだ忍札：どれを伏せたかは分からないことを見出しの下に添える
  const trapHead = el('div', 'rest-traps-head');
  trapHead.append(el('b', 'rest-title', '持ち込んだ忍札'), el('span', '', 'どれを伏せたかは分かりません'));
  const trapList = el('div', 'rest-list');
  // 札を押すと、その札の説明をここに出す
  const restAbout = el('div', 'rest-about');
  restAbout.setAttribute('aria-live', 'polite');
  const restClose = button('rest-close', '閉じる');
  restBox.append(restTitle, restList, trapHead, trapList, restAbout, restClose);
  rest.append(restBox);

  // ---- 札の説明の場所（広い画面の左上。ふだんは CSS で隠す） ----
  const panel = createCardPanel();

  root.append(foe, board, footer, rest, panel.root);

  // ---- 押されたとき ----
  restBtn.addEventListener('click', () => {
    if (!last) return;
    const foeSide: Side = last.me === 'sente' ? 'gote' : 'sente';
    const { open, traps } = restView(last.view.players[foeSide].cards);
    restList.replaceChildren();
    trapList.replaceChildren();
    if (open.length === 0) restList.append(el('p', 'rest-none', traps.length > 0 ? '術札・纏札は残っていません' : '残りの札はありません'));
    trapHead.hidden = traps.length === 0;
    trapList.hidden = traps.length === 0;
    const about = (id: CardId | null): void => {
      restAbout.replaceChildren();
      if (!id) {
        restAbout.append(el('p', 'rest-hint', open.length + traps.length > 0 ? '札を押すと説明が出ます' : ''));
        return;
      }
      const c = CARDS[id];
      const k = KIND_MARK[c.kind];
      restAbout.className = `rest-about ${k.color}`;
      const head = el('div', 'rest-about-head');
      head.append(el('b', '', c.name), el('span', '', `${k.label}・コスト${c.cost}`));
      restAbout.append(head, el('p', '', c.text));
    };
    about(null);
    restAbout.className = 'rest-about';
    const addCard = (list: HTMLElement, id: CardId, fired = false): void => {
      const fig = button(fired ? 'rest-card fired' : 'rest-card', '');
      fig.setAttribute('aria-pressed', 'false');
      fig.setAttribute('aria-label', `${CARDS[id].name}${fired ? '（発動済み）' : ''}の説明`);
      fig.innerHTML = cardHtml(id, { size: 'small' }); // 定数だけでできた文字列
      // 発動した忍札：朱の「済」の判を札に押す
      if (fired) fig.append(el('span', 'rest-fired', '済'));
      fig.append(el('span', 'cap', CARDS[id].name));
      fig.addEventListener('click', () => {
        for (const b of restBox.querySelectorAll('.rest-card[aria-pressed]')) b.setAttribute('aria-pressed', 'false');
        fig.setAttribute('aria-pressed', 'true');
        about(id);
      });
      list.append(fig);
    };
    for (const id of open) addCard(restList, id);
    for (const t of traps) addCard(trapList, t.id, t.fired);
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
      // 成り上がり：強くなるまでは墨の判で残りの手数を数え、強くなったら朱の「強」の判に変わる
      if (c.cardId === 'shoryu') {
        const wait = shoryuWait(view);
        card.classList.add('powered');
        const stamp = el('span', wait > 0 ? 'power-stamp wait' : 'power-stamp', wait > 0 ? String(wait) : '強');
        stamp.setAttribute('aria-label', wait > 0 ? `あと${wait}手で強くなる` : '強くなっている');
        card.append(stamp);
      }
      if (sel.card === c.uid) card.classList.add('sel');
      const tap = (): void => emit('card', c.uid);
      card.addEventListener('click', tap);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
      });
      hand.append(card);
    }
  }

  // 成り上がりの説明に添える「あと何手で強くなるか」
  function shoryuNote(view: GameState): string {
    const n = shoryuWait(view);
    return n === 0
      ? '強くなっています（飛車・角も・2つまで）'
      : `あと${n}手で強くなります（${SHORYU_POWER_MOVE}手目から）`;
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
      foeName.textContent = opts.foe?.name ?? `CPU・${opts.keiko ? '稽古・' : ''}${LEVEL_NAME[opts.level]}`;
      foeSeal.textContent = opts.foe?.seal ?? '敵';
      thinking.textContent = opts.thinking ? opts.foe?.waiting ?? '考え中' : '';
      const myTurn = view.turn === side && !opts.thinking && !view.result;
      meTurn.textContent = myTurn ? 'あなたの手番' : '相手の手番';
      // 判子：自分の手番は朱の「自」、相手の手番は藍の枠の「敵」（決着のあとは「自」のまま）
      const foeTurn = !myTurn && !view.result;
      meSeal.textContent = foeTurn ? opts.foe?.seal ?? '敵' : '自';
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
      if (opts.stop || opts.confirm) {
        const b = opts.confirm ? button('stop yes', 'これで決める') : button('stop', 'ここで止める');
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
      // 使える札の説明は閉じる。読むだけの説明は、相手が指しても開いたまま
      if (locked && !useBtn.disabled) hud.hideDetail();
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
      // 自分の札を押したら、相手の札の説明はしまう（閉じても戻さない）
      panel.clear();
      detail.className = `detail ${k.color}`;
      dArt.innerHTML = cardHtml(id); // 定数だけでできた文字列
      dName.textContent = c.name;
      dMeta.textContent = `${k.label}・コスト${c.cost}`;
      dText.textContent = c.text;
      const power = id === 'shoryu' && last ? shoryuNote(last.view) : null;
      dPower.textContent = power ?? '';
      dPower.hidden = power === null;
      dNote.hidden = usable;
      useBtn.disabled = !usable;
      detail.hidden = false;
      hud.select({ card: uid });
      (usable ? useBtn : dCancel).focus();
    },
    showFoeCard(id) {
      // 読むだけの説明を開いたままだと相手の札が隠れるので閉じる
      hud.hideDetail();
      panel.showFoe(id);
    },
    clearFoeCard() {
      panel.clear();
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
