// 対局前の札見せ：上に CPU の持ち込み、下に自分の持ち込みを表向きで並べ、
// 拍子木と同時に中央で「いざ」の筆文字。1.6 秒で対局へ。タップ（Enter・Space）で飛ばせる。
// 稽古の「くじ」は、この画面を開くたびに相手の札を引き直す（ここで初めて中身がわかる）。
// 駒落ちが無ければ、くじで決まった先手・後手を「自分の持ち込み」の見出しの横に判で押してから「いざ」。
// CPU 戦はここでくじを引き、対局へ first として渡す。友と対局（friend）では相手は「友」、くじは誘った側が引いたもの
import type { CardId } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { validateDeck } from '../../cards';
import { cardHtml } from '../../view/cardArt';
import { getSound } from '../../fx/sound';
import { makeRng } from '../../ai/random';
import { drawFoeDeck, foeLabel, keikoOf, type Keiko } from '../keiko';
import { HANDICAP_LABEL } from '../../rules/board';
import { loadHandicap, safeStore } from '../storage';
import { showScreen, type Screen } from '../screens';
import { el, pageHead } from './ui';
import { endSession, peekSession } from '../../net/current';
import type { Handicap, Side } from '../../rules/types';

export interface RevealParams { level: Level; deck: CardId[]; keiko?: Keiko; friend?: boolean }

const SHOW_MS = 1600; // 札見せの長さ
const IZA_AT = 260;   // 幕が開ききるころに「いざ」と拍子木
const KUJI_AT = 300;  // くじの判を押す
const KUJI_DELAY = 1000; // くじの判のぶん「いざ」を遅らせる

export function revealScreen(params: unknown): Screen {
  const q = (params ?? {}) as Partial<RevealParams>;
  const level: Level = q.level === 'normal' || q.level === 'strong' ? q.level : 'weak';
  const keiko = keikoOf(q.keiko);
  // 友と対局：札・駒落ち・先手は Session の setup から（自分の席から見た形にする）
  const setup = q.friend ? peekSession()?.setup() ?? null : null;
  const seat = peekSession()?.seat() ?? 'sente';
  const friend = setup !== null;
  const deck = setup ? setup.decks[seat] : q.deck && validateDeck(q.deck) === null ? q.deck : [];
  const foeDeck = setup ? setup.decks[seat === 'sente' ? 'gote' : 'sente'] : drawFoeDeck(level, keiko, makeRng(Date.now()));
  // 駒落ちは「自分（sente）／相手（gote）」の形にそろえる
  const handi: Handicap | null = setup
    ? { kind: setup.handicap.kind, side: setup.handicap.side === seat ? 'sente' : 'gote' }
    : null;
  // CPU 戦のくじ（駒落ちがあれば落とした側が先なので引かない）。自分＝sente
  const cpuHandi = setup ? null : loadHandicap(safeStore());
  const cpuFirst: Side = cpuHandi && cpuHandi.kind !== 'none' ? cpuHandi.side : Math.random() < 0.5 ? 'sente' : 'gote';
  const iFirst = setup ? setup.first === seat : cpuFirst === 'sente';
  let timers: number[] = [];
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let gone = false;

  // 対局へ（1回だけ）
  const go = (): void => {
    if (gone) return;
    gone = true;
    if (friend) void showScreen('match', { friend: true, level, deck });
    else void showScreen('match', { level, deck, keiko, foeDeck, first: cpuFirst });
  };

  return {
    mount(root) {
      const box = el('div', 'page reveal');
      box.dataset.screen = 'reveal';

      const h = handi ?? loadHandicap(safeStore());
      const row = (who: string, ids: CardId[], cls: string): HTMLElement => {
        const sec = el('section', `reveal-row ${cls}`);
        const list = el('div', 'reveal-cards');
        list.innerHTML = ids.map((id) => cardHtml(id)).join(''); // 定数だけでできた文字列
        if (ids.length === 0) list.append(el('p', 'none', '札なし'));
        // 見出しの行（くじの判をこの横に押す。札の列の上なので「いざ」にかぶらない）
        const head = el('div', 'reveal-head');
        head.append(el('h2', '', who));
        sec.append(head, list);
        // 駒落ちのある側に、何落ちかを添える（落とした側が先に指す）
        if (h.kind !== 'none' && (h.side === 'sente') === (cls === 'me')) {
          sec.append(el('p', 'handi-tag', `${HANDICAP_LABEL[h.kind]}・先に指す`));
        }
        return sec;
      };

      // 画面のどこを押しても飛ばせる（「戻る」は除く）
      const skip = el('div', 'reveal-skip');
      skip.setAttribute('role', 'button');
      skip.tabIndex = 0;
      skip.setAttribute('aria-label', '札見せを飛ばして対局を始める');
      const iza = el('div', 'iza', 'いざ');
      iza.setAttribute('aria-hidden', 'true');
      const foeRow = row(friend ? '友の持ち込み' : `相手（${foeLabel(level, keiko)}）の持ち込み`, foeDeck, 'foe');
      const meRow = row('自分の持ち込み', deck, 'me');
      skip.append(foeRow, iza, meRow);
      // くじの判（駒落ちがあれば落とした側が先なので、くじは引いていない）
      const kuji = h.kind === 'none' ? el('div', `kuji-ban ${iFirst ? 'saki' : 'ato'}`, iFirst ? '先' : '後') : null;
      if (kuji) {
        kuji.setAttribute('role', 'img');
        kuji.setAttribute('aria-label', iFirst ? 'くじで先手になりました' : 'くじで後手になりました');
        meRow.querySelector('.reveal-head')?.append(kuji);
      }
      skip.addEventListener('click', go);

      const back = friend
        ? () => { gone = true; endSession(); void showScreen('title'); }
        : () => { gone = true; void showScreen('deck', { level, keiko }); };
      box.append(pageHead('札見せ', back), skip);
      root.append(box);
      // 「いざ」は、相手の札の列と自分の見出し（くじの判）のちょうど真ん中に置く（札が少ないときも判にかぶらない）
      const sk = skip.getBoundingClientRect();
      const top = foeRow.getBoundingClientRect().bottom;
      const bottom = (meRow.querySelector('.reveal-head') ?? meRow).getBoundingClientRect().top;
      if (bottom > top) iza.style.top = `${(top + bottom) / 2 - sk.top}px`;

      onKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (document.activeElement instanceof HTMLButtonElement) return; // 「戻る」を押したとき
          e.preventDefault();
          go();
        }
      };
      window.addEventListener('keydown', onKey);
      const delay = kuji ? KUJI_DELAY : 0;
      if (kuji) {
        timers.push(window.setTimeout(() => {
          if (gone) return;
          kuji.classList.add('on');
          getSound().play('komaHard'); // 判をドンと押す（録った駒の音）
        }, KUJI_AT));
      }
      timers.push(window.setTimeout(() => {
        if (gone) return;
        box.classList.add('on');
        getSound().play('hyoshigi');
      }, IZA_AT + delay));
      timers.push(window.setTimeout(go, SHOW_MS + delay));
    },
    unmount() {
      gone = true;
      for (const t of timers) clearTimeout(t);
      timers = [];
      if (onKey) window.removeEventListener('keydown', onKey);
      onKey = null;
    },
  };
}
