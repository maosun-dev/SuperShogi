// カード選び：上に残りのコスト（大きな数字）とコストの目盛り10個、中に種類ごとの行、
// 下に持ち込み中の札の列（タップで外す）と「おまかせ」「対局へ」。
import type { CardId } from '../../rules/types';
import type { CardKind } from '../../cards/types';
import type { Level } from '../../ai/levels';
import { CARDS, COST_LIMIT, validateDeck } from '../../cards';
import { KIND_MARK, cardHtml } from '../../view/cardArt';
import { makeRng } from '../../ai/random';
import { addReason, autoDeck, deckCost } from '../deck';
import { loadDeck, safeStore, saveDeck } from '../storage';
import { costMarks } from '../outcome';
import { showScreen, type Screen } from '../screens';
import { button, el, pageHead } from './ui';

const KINDS: CardKind[] = ['magic', 'trap', 'equip'];

export interface DeckParams { level: Level }

function levelOf(p: unknown): Level {
  const lv = (p as Partial<DeckParams> | undefined)?.level;
  return lv === 'normal' || lv === 'strong' ? lv : 'weak';
}

export function deckScreen(params: unknown): Screen {
  const level = levelOf(params);
  return {
    mount(root) {
      const store = safeStore();
      let deck: CardId[] = [...(loadDeck(store) ?? [])];

      const box = el('div', 'page deckb');
      box.dataset.screen = 'deck';

      // ---- 上：残りのコストと目盛り ----
      const meter = el('section', 'cost-meter');
      const left = el('div', 'left');
      const leftNum = el('span', 'num');
      left.append(el('span', 'cap', '残りのコスト'), leftNum);
      const dots = el('div', 'dots');
      dots.setAttribute('aria-hidden', 'true');
      const dotEls: HTMLElement[] = [];
      for (let i = 0; i < COST_LIMIT; i++) { const d = el('i'); dots.append(d); dotEls.push(d); }
      meter.append(left, dots);
      const msg = el('p', 'msg');
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');

      // ---- 中：種類ごとの行 ----
      const rows = el('div', 'rows');
      const pickBtns = new Map<CardId, HTMLButtonElement>();
      const ids = Object.keys(CARDS) as CardId[];
      for (const kind of KINDS) {
        const k = KIND_MARK[kind];
        const mine = ids.filter((id) => CARDS[id].kind === kind).sort((a, b) => CARDS[a].cost - CARDS[b].cost);
        const sec = el('section', `kind-row ${k.color}`);
        const h2 = el('h2');
        h2.append(el('span', 'seal', k.mark), document.createTextNode(k.label));
        const row = el('div', 'row');
        for (const id of mine) {
          const b = button('pick', '', () => add(id));
          pickBtns.set(id, b);
          row.append(b);
        }
        sec.append(h2, row);
        rows.append(sec);
      }

      // ---- 下：持ち込み中の札と、おまかせ・対局へ ----
      const foot = el('footer', 'deck-foot');
      const strip = el('div', 'strip');
      strip.setAttribute('aria-label', '持ち込み中の札');
      const acts = el('div', 'acts');
      const auto = button('ghost', 'おまかせ', () => {
        deck = autoDeck(makeRng(Date.now()));
        msg.textContent = 'おまかせで組みました';
        render();
      });
      const go = button('primary', '対局へ', () => {
        if (deck.length === 0 || validateDeck(deck) !== null) return;
        saveDeck(store, deck);
        void showScreen('reveal', { level, deck: [...deck] });
      });
      acts.append(auto, go);
      foot.append(el('h2', 'foot-cap', '持ち込み'), strip, acts);

      function add(id: CardId): void {
        const why = addReason(deck, id);
        if (why) { msg.textContent = `${CARDS[id].name}は足せません。${why}`; return; }
        deck.push(id);
        msg.textContent = '';
        render();
      }

      function remove(i: number): void {
        deck.splice(i, 1);
        msg.textContent = '';
        render();
        // 外したあとは、同じ位置の札（なければ「おまかせ」）に枠を移す
        const next = strip.querySelectorAll<HTMLButtonElement>('button')[Math.min(i, deck.length - 1)];
        (next ?? auto).focus();
      }

      function render(): void {
        const cost = deckCost(deck);
        leftNum.textContent = String(COST_LIMIT - cost);
        left.setAttribute('aria-label', `残りのコスト ${COST_LIMIT - cost}（10のうち）`);
        costMarks(deck).forEach((kind, i) => { dotEls[i].className = kind ? KIND_MARK[kind].color : ''; });
        for (const [id, b] of pickBtns) {
          const n = deck.filter((d) => d === id).length;
          b.innerHTML = cardHtml(id, { count: n }); // 定数だけでできた文字列
          b.setAttribute('aria-label', `${CARDS[id].name}を足す（コスト${CARDS[id].cost}、${n}枚選択中）`);
          b.classList.toggle('full', addReason(deck, id) !== null);
        }
        strip.replaceChildren();
        if (deck.length === 0) strip.append(el('p', 'none', '上の札を押して足してください'));
        deck.forEach((id, i) => {
          const b = button('chosen', '', () => remove(i));
          b.innerHTML = cardHtml(id, { size: 'small' }); // 定数だけでできた文字列
          b.setAttribute('aria-label', `${CARDS[id].name}を外す`);
          strip.append(b);
        });
        go.disabled = deck.length === 0 || validateDeck(deck) !== null;
      }

      render();
      box.append(pageHead('カード選び', 'level'), meter, msg, rows, foot);
      root.append(box);
    },
    unmount() {},
  };
}
