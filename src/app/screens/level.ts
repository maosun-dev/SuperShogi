// 強さ選び：上の定式幕で「序幕｜大詰」を切り替え、その幕の3人を札で縦に並べる。前に選んだ幕を覚えておく。
// 序幕＝弱い・ふつう・強い（胡粉の札に色の帯）、大詰＝鬼・師範・傾奇者（柄を札いっぱいに敷いた札）。
// 各札に CPU の持ち込み（くじの強さは札の裏1枚）と、その強さの戦績。
// いちばん下に「稽古」：相手の強さと持ち込みを自分で決める（前回決めた札を小さく見せる。戦績は数えない）
import { LEVEL_NAME, LEVELS, OOZUME, type Level } from '../../ai/levels';
import { cardHtml } from '../../view/cardArt';
import { loadKeiko, loadLevelAct, loadTally, safeStore, saveLevelAct, type LevelAct } from '../storage';
import { tallyText } from '../outcome';
import { showScreen, type Screen } from '../screens';
import { el, kujiBacksHtml, pageHead, writeKouzan } from './ui';
import { actLevels, oozumeGara, type OozumeLevel } from './oozumeGara';

// 強さの目安（どんな人に向いた相手か）
const LEVEL_NOTE: Record<Level, string> = {
  weak: '駒の動きを覚えたら',
  normal: '詰みが分かってきたら',
  strong: '将棋アプリの級位者に',
  oni: '札は毎局くじ・札で暴れる',
  shihan: '定跡で堅く',
  kabuki: '最後の相手',
};

const ACTS: { act: LevelAct; name: string; sub: string }[] = [
  { act: 'jo', name: '序幕', sub: 'はじめての方に' },
  { act: 'oo', name: '大詰', sub: '将棋を指せる方に' },
];

const isOozume = (lv: Level): lv is OozumeLevel => (OOZUME as readonly Level[]).includes(lv);

export function levelScreen(): Screen {
  return {
    mount(root) {
      const box = el('div', 'page level');
      box.dataset.screen = 'level';
      const store = safeStore();
      let act = loadLevelAct(store);

      // ---- 幕の切り替え（定式幕） ----
      const tabs = el('div', 'level-acts');
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '幕');
      const list = el('div', 'level-list');
      list.id = 'level-list';
      list.setAttribute('role', 'tabpanel');
      const tabBtns = ACTS.map(({ act: a, name, sub }) => {
        const b = el('button', 'level-act');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-controls', 'level-list');
        b.setAttribute('aria-label', `${name}。${sub}`);
        const n = el('span', 'act-name');
        writeKouzan(n, name);
        b.append(n, el('span', 'act-sub', sub));
        b.addEventListener('click', () => {
          if (act === a) return;
          act = a;
          saveLevelAct(store, a);
          render();
        });
        tabs.append(b);
        return [b, a] as const;
      });

      // ---- 1人ぶんの札 ----
      const fuda = (lv: Level): HTMLElement => {
        const t = tallyText(loadTally(store, lv));
        const b = el('button', `level-fuda ${lv}${isOozume(lv) ? ' oozume' : ''}`);
        b.type = 'button';
        b.setAttribute('aria-label', `${LEVEL_NAME[lv]}。${LEVEL_NOTE[lv]}。戦績 ${t}`);
        const name = el('span', 'lv-name');
        writeKouzan(name, LEVEL_NAME[lv]);
        const cards = el('span', 'lv-cards');
        cards.setAttribute('aria-hidden', 'true');
        // くじの強さは、毎局ちがう札なので札の裏を1枚だけ
        if (LEVELS[lv].kuji) cards.innerHTML = kujiBacksHtml(1, 0.486); // 定数だけでできた文字列
        else cards.innerHTML = LEVELS[lv].deck.map((id) => cardHtml(id, { size: 'small' })).join(''); // 定数だけでできた文字列
        if (isOozume(lv)) b.insertAdjacentHTML('afterbegin', oozumeGara(lv)); // 定数だけでできた SVG
        b.append(name, el('span', 'lv-tally', t), cards, el('span', 'lv-note', LEVEL_NOTE[lv]));
        b.addEventListener('click', () => { void showScreen('deck', { level: lv }); });
        return b;
      };

      // ---- 稽古：前回の相手（強さと札。くじなら札の裏）を見せ、押すと相手の札選びへ ----
      const k = loadKeiko(store);
      const kb = el('button', 'level-fuda keiko');
      kb.type = 'button';
      const kuji = k.deck === 'kuji';
      kb.setAttribute('aria-label', `稽古。相手の強さと持ち込みを自分で決める。今は${LEVEL_NAME[k.level]}、${kuji ? '札はくじ' : `札${k.deck.length}枚`}`);
      const kName = el('span', 'lv-name');
      writeKouzan(kName, '稽古');
      const kSub = el('span', 'lv-tally', '強さも選べます');
      const kCards = el('span', 'lv-cards');
      kCards.setAttribute('aria-hidden', 'true');
      // くじは枚数が毎局かわるので、札の裏は目印として1枚だけ
      if (k.deck === 'kuji') kCards.innerHTML = kujiBacksHtml(1, 0.486); // 定数だけでできた文字列
      else if (k.deck.length > 0) kCards.innerHTML = k.deck.map((id) => cardHtml(id, { size: 'small' })).join('');
      else kCards.append(el('span', 'lv-none', '札なし'));
      kb.append(kName, kSub, kCards);
      kb.addEventListener('click', () => { void showScreen('deck', { level: k.level, role: 'foe' }); });

      function render(): void {
        for (const [b, a] of tabBtns) {
          b.setAttribute('aria-selected', String(a === act));
          b.tabIndex = a === act ? 0 : -1;
        }
        list.replaceChildren(...actLevels(act).map(fuda));
        list.dataset.act = act;
      }
      render();

      const foot = el('div', 'level-keiko');
      foot.append(kb);
      box.append(pageHead('強さ選び', 'title'), tabs, list, foot);
      root.append(box);
    },
    unmount() {},
  };
}
