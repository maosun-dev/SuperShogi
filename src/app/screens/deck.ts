// カード選び：上に残りのコスト（大きな数字）とコストの目盛り10個、中に種類ごとの行、
// 下に持ち込み中の札の列、駒落ちの選び、「おまかせ」「対局へ」。
// 上の一覧の札は押すと大きな札と説明が出て、そこで「入れる」「抜く」を選ぶ（図鑑と同じ部品 cardLook）。
// 下の持ち込みの札は、押すとすぐ外れる。
// role が 'foe' のときは稽古の相手の札を組む：駒落ちの代わりに相手の強さ、「おまかせ」の代わりに「くじ」（毎局引き直す）、
// 「対局へ」の代わりに「次へ」（自分の札選びへ）。稽古の自分の札選び（keiko あり）の「戻る」は相手の札選びへ
import type { CardId, HandicapKind, Side } from '../../rules/types';
import { HANDICAP_LABEL } from '../../rules/board';
import type { CardKind } from '../../cards/types';
import type { Level } from '../../ai/levels';
import { CARDS, COST_LIMIT, validateDeck } from '../../cards';
import { KIND_MARK, cardHtml } from '../../view/cardArt';
import { makeRng } from '../../ai/random';
import { addReason, autoDeck, deckCost, lookActions } from '../deck';
import { createCardLook, type CardLook } from './cardLook';
import { loadDeck, loadHandicap, loadKeiko, safeStore, saveDeck, saveHandicap, saveKeiko } from '../storage';
import { LEVEL_NAME, costMarks } from '../outcome';
import { keikoOf, type Keiko } from '../keiko';
import { showScreen, type Screen } from '../screens';
import { button, el, kujiBacksHtml, pageHead } from './ui';

const KINDS: CardKind[] = ['magic', 'trap', 'equip'];

export interface DeckParams { level: Level; role?: 'me' | 'foe'; keiko?: Keiko }

function levelOf(p: unknown): Level {
  const lv = (p as Partial<DeckParams> | undefined)?.level;
  return lv === 'normal' || lv === 'strong' ? lv : 'weak';
}

export function deckScreen(params: unknown): Screen {
  const level = levelOf(params);
  const foeRole = (params as Partial<DeckParams> | undefined)?.role === 'foe';
  const keiko = keikoOf((params as Partial<DeckParams> | undefined)?.keiko);
  let look: CardLook | null = null;
  return {
    mount(root) {
      const lk = createCardLook();
      look = lk;
      const store = safeStore();
      // 相手の札を組むときは、保存してある稽古の相手から始める
      const saved = foeRole ? loadKeiko(store) : null;
      let foeLevel: Level = saved?.level ?? level;
      let kuji = saved?.deck === 'kuji';
      let deck: CardId[] = saved ? (saved.deck === 'kuji' ? [] : [...saved.deck]) : [...(loadDeck(store) ?? [])];

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
          const b = button('pick', '', () => openLook(id, b));
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
      const auto = foeRole
        ? button('ghost', 'くじ', () => {
          kuji = true;
          deck = [];
          msg.textContent = 'くじにしました。対局のたびに引き直します';
          render();
        })
        : button('ghost', 'おまかせ', () => {
          deck = autoDeck(makeRng(Date.now()));
          msg.textContent = 'おまかせで組みました';
          render();
        });
      // ---- 駒落ち：種類（iPhone では回す選び方になる）と、どちらに付けるか ----
      let handicap = loadHandicap(store);
      const handi = el('div', 'handi');
      const kindSel = el('select', 'handi-kind');
      kindSel.id = 'handi-kind';
      for (const [k, label] of Object.entries(HANDICAP_LABEL)) {
        const o = el('option', '', label);
        o.value = k;
        kindSel.append(o);
      }
      kindSel.value = handicap.kind;
      const kindLab = el('label', 'handi-cap', '駒落ち');
      kindLab.htmlFor = 'handi-kind';
      const sideSeg = el('div', 'seg handi-side');
      sideSeg.setAttribute('role', 'group');
      sideSeg.setAttribute('aria-label', '駒を落とす側');
      const sideBtn = (side: Side, text: string): HTMLButtonElement => button('', text, () => {
        handicap = { ...handicap, side };
        renderHandi();
      });
      const meBtn = sideBtn('sente', '自分');
      const foeBtn = sideBtn('gote', '相手');
      sideSeg.append(meBtn, foeBtn);
      const handiNote = el('p', 'handi-note');
      kindSel.addEventListener('change', () => {
        handicap = { ...handicap, kind: kindSel.value as HandicapKind };
        renderHandi();
      });
      handi.append(kindLab, kindSel, sideSeg);
      function renderHandi(): void {
        const none = handicap.kind === 'none';
        for (const [b, side] of [[meBtn, 'sente'], [foeBtn, 'gote']] as const) {
          b.setAttribute('aria-pressed', String(!none && handicap.side === side));
          b.disabled = none;
        }
        handiNote.textContent = none ? '' : `${handicap.side === 'sente' ? '自分' : '相手'}が${HANDICAP_LABEL[handicap.kind]}で、先に指します`;
      }
      renderHandi();

      const go = foeRole
        ? button('primary', '次へ', () => {
          if (!kuji && validateDeck(deck) !== null) return;
          const k: Keiko = { level: foeLevel, deck: kuji ? 'kuji' : [...deck] };
          saveKeiko(store, k);
          void showScreen('deck', { level: foeLevel, keiko: k });
        })
        : button('primary', '対局へ', () => {
          if (validateDeck(deck) !== null) return; // 札なしでも始められる
          saveDeck(store, deck);
          saveHandicap(store, handicap);
          void showScreen('reveal', { level, deck: [...deck], keiko });
        });
      acts.append(auto, go);

      // ---- 相手の強さ（相手の札を組むときだけ。駒落ちの段の代わり） ----
      const lvRow = el('div', 'handi foe-level');
      const lvCap = el('span', 'handi-cap', '強さ');
      const lvSeg = el('div', 'seg handi-side');
      lvSeg.setAttribute('role', 'group');
      lvSeg.setAttribute('aria-label', '相手の強さ');
      const lvBtns = (['weak', 'normal', 'strong'] as Level[]).map((lv) => {
        const b = button('', LEVEL_NAME[lv], () => { foeLevel = lv; renderLevel(); });
        lvSeg.append(b);
        return [b, lv] as const;
      });
      lvRow.append(lvCap, lvSeg);
      function renderLevel(): void {
        for (const [b, lv] of lvBtns) b.setAttribute('aria-pressed', String(lv === foeLevel));
      }
      renderLevel();

      // 見出しは置かない（下の段を低くして、上の札18枚を横送りなしで見せる）
      if (foeRole) foot.append(strip, lvRow, acts);
      else foot.append(strip, handi, handiNote, acts);

      function add(id: CardId): void {
        const why = addReason(deck, id);
        if (why) { msg.textContent = `${CARDS[id].name}は入れられません。${why}`; return; }
        kuji = false; // 札を選んだら、くじはやめる
        deck.push(id);
        msg.textContent = `${CARDS[id].name}を入れました`;
        render();
      }

      function remove(id: CardId): void {
        deck = deck.filter((d) => d !== id);
        msg.textContent = `${CARDS[id].name}を抜きました`;
        render();
      }

      // 大きな札と説明を出し、その札でできること（入れる・抜く）を添える
      function openLook(id: CardId, from: HTMLElement): void {
        const la = lookActions(deck, id);
        lk.open(id, from, [{
          label: la.kind === 'add' ? '入れる' : '抜く',
          primary: la.kind === 'add',
          disabled: la.disabled,
          note: la.note,
          run: () => {
            if (la.kind === 'add') add(id); else remove(id);
            lk.close();
            // 下の列の札は描き直しで消えるので、上の一覧の同じ札に枠を移す
            pickBtns.get(id)?.focus();
          },
        }]);
      }

      function render(): void {
        const cost = deckCost(deck);
        leftNum.textContent = String(COST_LIMIT - cost);
        left.setAttribute('aria-label', `残りのコスト ${COST_LIMIT - cost}（10のうち）`);
        costMarks(deck).forEach((kind, i) => { dotEls[i].className = kind ? KIND_MARK[kind].color : ''; });
        for (const [id, b] of pickBtns) {
          const inDeck = deck.includes(id);
          // 入っている札には朱の「入」の判を重ねる
          b.innerHTML = cardHtml(id) + (inDeck ? '<span class="stamp" aria-hidden="true">入</span>' : ''); // 定数だけでできた文字列
          b.setAttribute('aria-label', `${CARDS[id].name}（コスト${CARDS[id].cost}、${inDeck ? '持ち込み中' : '入っていない'}）の説明を見る`);
          b.classList.toggle('in', inDeck);
          b.classList.toggle('full', !inDeck && addReason(deck, id) !== null);
        }
        strip.replaceChildren();
        if (kuji) {
          strip.insertAdjacentHTML('beforeend', kujiBacksHtml(3, 0.486)); // 定数だけでできた文字列
          strip.append(el('p', 'none', '対局のたびに、くじで組みます'));
        } else if (deck.length === 0) strip.append(el('p', 'none', foeRole ? '相手は札なしで指します。「くじ」なら毎局ちがう札です' : '持ち込みの札はまだありません。札なしでも対局できます'));
        deck.forEach((id) => {
          // 持ち込みの札は、押すとすぐ外す（説明は上の一覧から見られる）
          const b = button('chosen', '', () => { remove(id); pickBtns.get(id)?.focus({ preventScroll: true }); });
          b.innerHTML = cardHtml(id, { size: 'small' }); // 定数だけでできた文字列
          b.setAttribute('aria-label', `${CARDS[id].name}を外す`);
          strip.append(b);
        });
        go.disabled = validateDeck(deck) !== null;
      }

      render();
      // 稽古の自分の札選びは、相手の札選びへ戻る
      const head = foeRole ? pageHead('相手の札', 'level')
        : keiko ? pageHead('札選び', 'deck', { level, role: 'foe' })
        : pageHead('札選び', 'level');
      box.append(head, meter, msg, rows, foot, lk.el);
      root.append(box);
    },
    unmount() {
      look?.destroy();
      look = null;
    },
  };
}
