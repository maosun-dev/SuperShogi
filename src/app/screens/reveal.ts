// 対局前の札見せ：上に CPU の持ち込み、下に自分の持ち込みを表向きで並べ、
// 拍子木と同時に中央で「いざ」の筆文字。1.6 秒で対局へ。タップ（Enter・Space）で飛ばせる。
// 稽古の「くじ」は、この画面を開くたびに相手の札を引き直す（ここで初めて中身がわかる）。
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

export interface RevealParams { level: Level; deck: CardId[]; keiko?: Keiko }

const SHOW_MS = 1600; // 札見せの長さ
const IZA_AT = 260;   // 幕が開ききるころに「いざ」と拍子木

export function revealScreen(params: unknown): Screen {
  const q = (params ?? {}) as Partial<RevealParams>;
  const level: Level = q.level === 'normal' || q.level === 'strong' ? q.level : 'weak';
  const deck = q.deck && validateDeck(q.deck) === null ? q.deck : [];
  const keiko = keikoOf(q.keiko);
  const foeDeck = drawFoeDeck(level, keiko, makeRng(Date.now()));
  let timers: number[] = [];
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let gone = false;

  // 対局へ（1回だけ）
  const go = (): void => {
    if (gone) return;
    gone = true;
    void showScreen('match', { level, deck, keiko, foeDeck });
  };

  return {
    mount(root) {
      const box = el('div', 'page reveal');
      box.dataset.screen = 'reveal';

      const h = loadHandicap(safeStore());
      const row = (who: string, ids: CardId[], cls: string): HTMLElement => {
        const sec = el('section', `reveal-row ${cls}`);
        const list = el('div', 'reveal-cards');
        list.innerHTML = ids.map((id) => cardHtml(id)).join(''); // 定数だけでできた文字列
        if (ids.length === 0) list.append(el('p', 'none', '札なし'));
        sec.append(el('h2', '', who), list);
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
      skip.append(row(`相手（${foeLabel(level, keiko)}）の持ち込み`, foeDeck, 'foe'), iza, row('自分の持ち込み', deck, 'me'));
      skip.addEventListener('click', go);

      box.append(pageHead('札見せ', () => { gone = true; void showScreen('deck', { level, keiko }); }), skip);
      root.append(box);

      onKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (document.activeElement instanceof HTMLButtonElement) return; // 「戻る」を押したとき
          e.preventDefault();
          go();
        }
      };
      window.addEventListener('keydown', onKey);
      timers.push(window.setTimeout(() => {
        if (gone) return;
        box.classList.add('on');
        getSound().play('hyoshigi');
      }, IZA_AT));
      timers.push(window.setTimeout(go, SHOW_MS));
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
