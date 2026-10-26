// つなぐ画面（友と対局）：千社札「誘う」「探す」。
// 誘うと合言葉を大きな駒に墨で書いて待つ。探すと、近くで誘っている人の合言葉が駒の形のボタンで並ぶ。
// つながったら札選びへ。戻るでつながりを捨ててタイトルへ
import { getSession, endSession } from '../../net/current';
import type { SessionEvent } from '../../net/session';
import { showScreen, type Screen } from '../screens';
import { button, el, pageHead } from './ui';

export interface LinkParams { notice?: string } // 前の画面からの知らせ（相手がやめた・切れた）

const HINT_MS = 10000; // これだけ探して見つからなければ、ローカルネットワークの案内を出す
const JOIN_MS = 25000; // つないでいる間は合言葉を押しても頼み直さない（iPhone は 20 秒で諦めて失敗を知らせる。届かなかったとき用の見切り。自動で頼み直すたびに測り直す）
const WIFI_NOTE = 'Wi-Fi をオンにしておくと、つながりやすくなります（どこの Wi-Fi にもつながっていなくて大丈夫です）';

/** 合言葉を縦に書いた駒（五角形）。big は誘う側の大きな駒 */
function komaOf(code: string, big: boolean): HTMLElement {
  const k = el('span', big ? 'link-koma big' : 'link-koma');
  k.append(el('span', 'ji', code));
  return k;
}

export function linkScreen(params: unknown): Screen {
  const notice = (params as LinkParams | undefined)?.notice ?? null;
  let off: (() => void) | null = null;
  let hintTimer = 0;
  let joinTimer = 0;
  return {
    mount(root) {
      const s = getSession();
      const box = el('div', 'page link');
      box.dataset.screen = 'link';
      const msg = el('p', 'link-msg');
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');
      if (notice) msg.textContent = notice;
      const body = el('div', 'link-body');

      // ---- はじめ：誘う・探す ----
      const choose = (): void => {
        // 区切りのいい所で改行する（「探す」が行の途中で切れないように）
        const lead = el('p', 'link-lead');
        lead.append('片方の iPhone で「誘う」、', el('br'), 'もう片方で「探す」を押してください');
        const row = el('nav', 'link-fuda');
        row.append(
          button('fuda wana', '誘う', () => { msg.textContent = ''; s.host(); hosting(); }),
          button('fuda mahou', '探す', () => { msg.textContent = ''; s.browse(); browsing(); }),
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
          el('p', 'link-note', '相手の iPhone で「探す」を押し、この合言葉を選んでもらってください'),
          el('p', 'link-note', WIFI_NOTE),
        );
      };

      // ---- 探す：見つかった合言葉を駒のボタンで並べる ----
      const list = el('div', 'link-peers');
      list.setAttribute('aria-label', '近くで誘っている人');
      const hint = el('p', 'link-note hint', '見つからないときは、両方の iPhone で 設定 → 傾将棋 → ローカルネットワーク をオンにしてください');
      hint.hidden = true;
      // 頼みが重なるとかえってつながりにくいので、つないでいる間は押しても何もしない
      let joining = false;
      let joiningName = '';
      const joinDone = (): void => { joining = false; clearTimeout(joinTimer); };
      const renderPeers = (): void => {
        list.replaceChildren();
        const peers = s.peers();
        if (peers.length === 0) { list.append(el('p', 'link-note', '近くで誘っている人を探しています')); return; }
        hint.hidden = true;
        for (const p of peers) {
          const b = button('link-peer', '', () => {
            if (joining) return;
            joining = true;
            joiningName = p.name;
            joinTimer = window.setTimeout(joinDone, JOIN_MS);
            s.join(p.peer);
            msg.textContent = `${p.name} につないでいます`;
          });
          b.append(komaOf(p.name, false));
          b.setAttribute('aria-label', `${p.name} につなぐ`);
          list.append(b);
        }
      };
      const browsing = (): void => {
        body.replaceChildren(el('p', 'link-lead', '相手の合言葉を選んでください'), list, hint, el('p', 'link-note', WIFI_NOTE));
        renderPeers();
        hintTimer = window.setTimeout(() => { if (s.peers().length === 0) hint.hidden = false; }, HINT_MS);
      };

      off = s.on((e: SessionEvent) => {
        switch (e.type) {
          case 'peers': renderPeers(); return;
          case 'connected': void showScreen('deck', { friend: true }); return;
          case 'joinRetry':
            clearTimeout(joinTimer);
            joinTimer = window.setTimeout(joinDone, JOIN_MS);
            msg.textContent = `${joiningName} につなぎ直しています`;
            return;
          case 'joinFailed':
            joinDone();
            msg.textContent = 'つながりませんでした。もう一度、合言葉を押してください';
            return;
          case 'versionMismatch':
            msg.textContent = '相手とアプリの版が違います。同じ版にそろえてください';
            body.replaceChildren();
            return;
        }
      });

      const head = pageHead('友と対局', () => { endSession(); void showScreen('title'); });
      box.append(head, msg, body);
      root.append(box);
      if (s.phase() === 'hosting') hosting();
      else if (s.phase() === 'browsing') browsing();
      else choose();
    },
    unmount() {
      off?.();
      off = null;
      clearTimeout(hintTimer);
      clearTimeout(joinTimer);
    },
  };
}
