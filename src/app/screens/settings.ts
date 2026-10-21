// 設定：演出の長さ「短め／長め」の切り替えと、音の大きさのつまみ。
// 変えたらすぐ保存し、すぐ効かせる（音は setVolume、演出の長さは演出役が毎回設定を読み直す）。
import { getSound } from '../../fx/sound';
import { loadSettings, safeStore, saveSettings, type Settings } from '../storage';
import { type Screen } from '../screens';
import { button, el, pageHead } from './ui';

export function settingsScreen(): Screen {
  let timer = 0;
  return {
    mount(root) {
      const store = safeStore();
      let s: Settings = loadSettings(store);
      const save = (next: Settings): void => { s = next; saveSettings(store, s); };

      const box = el('div', 'page settings');
      box.dataset.screen = 'settings';

      // ---- 演出の長さ ----
      const fxSec = el('section', 'set-item');
      const fxHead = el('h2', '', '演出の長さ');
      fxHead.id = 'set-fx';
      const seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-labelledby', 'set-fx');
      const short = button('', '短め');
      const long = button('', '長め');
      const paint = (): void => {
        short.setAttribute('aria-pressed', String(s.fx === 'short'));
        long.setAttribute('aria-pressed', String(s.fx === 'long'));
      };
      short.addEventListener('click', () => { save({ ...s, fx: 'short' }); paint(); });
      long.addEventListener('click', () => { save({ ...s, fx: 'long' }); paint(); });
      seg.append(short, long);
      fxSec.append(fxHead, seg, el('p', 'note', '札と決着の演出に効きます'));
      paint();

      // ---- 音の大きさ ----
      const volSec = el('section', 'set-item');
      const lab = el('label', '', '音の大きさ');
      lab.htmlFor = 'set-vol';
      const row = el('div', 'vol-row');
      const vol = el('input');
      vol.type = 'range';
      vol.id = 'set-vol';
      vol.min = '0';
      vol.max = '100';
      vol.step = '5';
      vol.value = String(Math.round(s.volume * 100));
      const out = el('output', 'vol-num');
      out.htmlFor.add('set-vol');
      const show = (): void => {
        out.textContent = vol.value === '0' ? '消音' : vol.value;
        vol.setAttribute('aria-valuetext', vol.value === '0' ? '消音' : `${vol.value}`);
        vol.style.setProperty('--p', `${vol.value}%`);
      };
      vol.addEventListener('input', () => {
        const v = Number(vol.value) / 100;
        save({ ...s, volume: v });
        getSound().setVolume(v);
        show();
      });
      // 指を離したら、今の大きさで短く鳴らして確かめる
      vol.addEventListener('change', () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => getSound().play('tick'), 30);
      });
      row.append(vol, out);
      volSec.append(lab, row);
      show();

      box.append(pageHead('設定', 'title'), fxSec, volSec);
      root.append(box);
    },
    unmount() { clearTimeout(timer); },
  };
}
