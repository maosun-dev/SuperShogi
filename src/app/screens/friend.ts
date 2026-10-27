// 友と対局：つなぎ方を選ぶ画面。千社札「近くの人と」（近距離通信）・「ネットで」（Game Center）。
// 札の下に、どんなときに向いているかを和紙の切れ端で添える
import { endSession, type LinkKind } from '../../net/current';
import { showScreen, type Screen, type ScreenName } from '../screens';
import { button, el, pageHead } from './ui';

/** そのつなぎ方の「誘う・探す」の画面 */
export function linkScreenOf(kind: LinkKind | null): ScreenName {
  return kind === 'gc' ? 'gclink' : 'link';
}

export function friendScreen(): Screen {
  return {
    mount(root) {
      const box = el('div', 'page link');
      box.dataset.screen = 'friend';
      const body = el('div', 'link-body');
      // 注意書きは区切りのいい所で改行する（言葉の途中で折れないように）
      const pick = (fuda: HTMLElement, lines: string[]): HTMLElement => {
        const col = el('div', 'friend-way');
        const note = el('p', 'link-note');
        lines.forEach((t, i) => { if (i > 0) note.append(el('br')); note.append(t); });
        col.append(fuda, note);
        return col;
      };
      const row = el('nav', 'friend-ways');
      row.append(
        pick(button('fuda midori', '近くの人と', () => { void showScreen('link'); }),
          ['2台が同じ Wi-Fi に', 'つながっていると', '安定します']),
        pick(button('fuda mahou', 'ネットで', () => { void showScreen('gclink'); }),
          ['離れていても', '遊べます', 'Game Center への', 'サインインが', '要ります']),
      );
      body.append(el('p', 'link-lead', 'つなぎ方を選んでください'), row);
      // ここに戻ってきたら、前のつながりは捨てる（つなぎ方を選び直すため）
      endSession();
      box.append(pageHead('友と対局', 'title'), body);
      root.append(box);
    },
    unmount() {},
  };
}
