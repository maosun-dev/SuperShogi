// 友と対局（ネットで＝Game Center）：千社札「誘う」「入れる」。
// 誘うと合言葉（駒の名前＋漢数字2つ）を大きな駒に書いて待つ。入れる側は駒の名前と漢数字2つを選んで、同じ合言葉でつなぐ。
// 近くの人を見つける仕組みはないので、合言葉は口で伝えて入れてもらう。つながったら札選びへ
import { currentGcLink, endSession, getSession } from '../../net/current';
import { GC_DIGITS, GC_PIECES } from '../../net/gcCode';
import type { SessionEvent } from '../../net/session';
import { showScreen, type Screen } from '../screens';
import { komaOf } from './link';
import { button, el, pageHead } from './ui';

export interface GcLinkParams { notice?: string } // 前の画面からの知らせ（相手がやめた・切れた）

const SIGN_IN_NOTE = 'iPhone の 設定 → Game Center でサインインしてください';
const NOT_FOUND = '相手が見つかりませんでした。合言葉と、2台が同じ版かを確かめてください';

/** 1つ選ぶボタンの並び（駒の名前・漢数字） */
function picker(label: string, items: readonly string[], onPick: (v: string) => void): { el: HTMLElement; value(): string | null } {
  const row = el('div', 'gc-picks');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  let chosen: string | null = null;
  const btns = items.map((v) => {
    const b = button('gc-pick', v, () => {
      chosen = v;
      for (const x of btns) x.setAttribute('aria-pressed', String(x === b));
      onPick(v);
    });
    b.setAttribute('aria-pressed', 'false');
    row.append(b);
    return b;
  });
  return { el: row, value: () => chosen };
}

export function gcLinkScreen(params: unknown): Screen {
  const notice = (params as GcLinkParams | undefined)?.notice ?? null;
  let off: (() => void) | null = null;
  let gone = false;
  return {
    mount(root) {
      const box = el('div', 'page link');
      box.dataset.screen = 'gclink';
      const msg = el('p', 'link-msg');
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');
      if (notice) msg.textContent = notice;
      const body = el('div', 'link-body');
      const s = getSession('gc');
      const link = currentGcLink();

      // ---- はじめ：誘う・入れる ----
      const choose = (): void => {
        const lead = el('p', 'link-lead');
        lead.append('片方の iPhone で「誘う」、', el('br'), 'もう片方で「入れる」を押してください');
        const row = el('nav', 'link-fuda');
        row.append(
          button('fuda wana', '誘う', () => { msg.textContent = ''; s.host(); hosting(); }),
          button('fuda mahou', '入れる', () => { msg.textContent = ''; entering(); }),
        );
        body.replaceChildren(lead, row);
      };

      // ---- 誘う：合言葉の駒を見せて待つ ----
      const hosting = (): void => {
        const code = s.code() ?? '';
        const k = komaOf(code, true);
        k.setAttribute('aria-label', `合言葉 ${code}`);
        body.replaceChildren(
          el('p', 'link-lead', '合言葉'),
          k,
          el('p', 'link-note', '相手の iPhone で「入れる」を押し、この合言葉を入れてもらってください'),
        );
      };

      // ---- 入れる：駒の名前と漢数字2つを選び、つなぐ ----
      const entering = (): void => {
        const preview = el('div', 'gc-preview');
        const go = button('primary', 'つなぐ', () => connect());
        const code = (): string | null => {
          const p = piece.value(), a = d1.value(), b = d2.value();
          return p && a && b ? `${p}の${a}${b}` : null;
        };
        const show = (): void => {
          const c = code();
          preview.replaceChildren(komaOf(c ?? '？', false));
          go.disabled = c === null;
        };
        const piece = picker('駒の名前', GC_PIECES, show);
        const d1 = picker('1つ目の数字', GC_DIGITS, show);
        const d2 = picker('2つ目の数字', GC_DIGITS, show);
        const connect = (): void => {
          const c = code();
          if (!c || !link) return;
          s.browse();
          link.enter(c);
          s.join(c);
          searching(c);
        };
        show();
        body.replaceChildren(el('p', 'link-lead', '相手の合言葉を入れてください'), preview, piece.el, d1.el, d2.el, go);
      };

      // ---- 入れたあと：探している間 ----
      const searching = (c: string): void => {
        msg.textContent = '相手を探しています';
        const k = komaOf(c, true);
        k.setAttribute('aria-label', `合言葉 ${c}`);
        body.replaceChildren(k, button('', 'やめる', () => { endSession(); void showScreen('gclink'); }));
      };

      off = s.on((e: SessionEvent) => {
        switch (e.type) {
          case 'connected': void showScreen('deck', { friend: true }); return;
          case 'joinRetry': msg.textContent = 'つなぎ直しています'; return;
          case 'joinFailed':
            // もう一度入れられるよう、つながりは作り直す
            endSession();
            void showScreen('gclink', { notice: NOT_FOUND });
            return;
          case 'versionMismatch':
            msg.textContent = '相手とアプリの版が違います。同じ版にそろえてください';
            body.replaceChildren();
            return;
        }
      });

      const head = pageHead('ネットで', () => { endSession(); void showScreen('friend'); });
      box.append(head, msg, body);
      root.append(box);

      // まず Game Center にサインイン（していなければ Apple の画面が出る）
      if (s.phase() === 'hosting') { hosting(); return; }
      msg.textContent = notice ?? 'Game Center にサインインしています';
      void (link?.signIn() ?? Promise.resolve(false)).then((ok) => {
        if (gone) return;
        if (!ok) { msg.textContent = SIGN_IN_NOTE; return; }
        msg.textContent = notice ?? '';
        choose();
      }, () => { if (!gone) msg.textContent = SIGN_IN_NOTE; });
    },
    unmount() {
      gone = true;
      off?.();
      off = null;
    },
  };
}
