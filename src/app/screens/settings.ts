// 設定：舞台（背景）の選び、背景の動き「多め／少なめ」、演出の長さ「短め／長め」、音の大きさのつまみ、対局の曲（試聴つき）、王を取る演出（仮の3案）、
// いちばん下に名の由来（「傾」と傾奇者）とクレジット（字体・部品と約束。全文は押すと開く）。
// 変えたらすぐ保存し、すぐ効かせる（音は setVolume、演出の長さは演出役が毎回設定を読み直す）。
import { getSound, type MusicName } from '../../fx/sound';
import { MATCH_TRACKS, MATCH_TRACK_LABEL } from '../music';
import { loadSettings, safeStore, saveSettings, type Settings } from '../storage';
import { STAGES, STAGE_LABEL, changeStage, effectiveMotion, prefersReducedMotion } from '../stageTheme';
import { layerUrl } from '../../view/backdrop';
import { type Screen } from '../screens';
import { button, el, pageHead } from './ui';
import { TITLE_EM, TITLE_GLYPHS } from '../titleGlyphs';
import { CREDITS, MIT_TEXT, OFL_NOTE } from '../credits';
import { KING_FX, KING_FX_LABEL, type KingFxChoice } from '../../fx/kingfx/kinds';

export function settingsScreen(): Screen {
  let timer = 0;
  return {
    mount(root) {
      const store = safeStore();
      let s: Settings = loadSettings(store);
      const save = (next: Settings): void => { s = next; saveSettings(store, s); };

      const box = el('div', 'page settings');
      box.dataset.screen = 'settings';
      const apply = (): void => changeStage(document.documentElement, s);

      // ---- 舞台：見本の絵を押して選ぶ。その場で背景が替わる ----
      const stSec = el('section', 'set-item');
      const stHead = el('h2', '', '舞台');
      stHead.id = 'set-stage';
      const picks = el('div', 'stage-picks');
      picks.setAttribute('role', 'group');
      picks.setAttribute('aria-labelledby', 'set-stage');
      const stageBtns = STAGES.map((id) => {
        const b = button('stage-pick', '');
        const img = el('img');
        img.src = layerUrl(import.meta.env.BASE_URL, id, 'thumb');
        img.alt = '';
        b.append(img, el('span', '', STAGE_LABEL[id]));
        b.addEventListener('click', () => { save({ ...s, stage: id }); apply(); paintStage(); });
        picks.append(b);
        return { id, b };
      });
      const paintStage = (): void => {
        for (const { id, b } of stageBtns) b.setAttribute('aria-pressed', String(s.stage === id));
      };
      stSec.append(stHead, picks);
      paintStage();

      // ---- 背景の動き ----
      const mvSec = el('section', 'set-item');
      const mvHead = el('h2', '', '背景の動き');
      mvHead.id = 'set-motion';
      const mvSeg = el('div', 'seg');
      mvSeg.setAttribute('role', 'group');
      mvSeg.setAttribute('aria-labelledby', 'set-motion');
      const many = button('', '多め');
      const few = button('', '少なめ');
      const paintMotion = (): void => {
        const m = effectiveMotion(s.motion, prefersReducedMotion());
        many.setAttribute('aria-pressed', String(m === 'full'));
        few.setAttribute('aria-pressed', String(m === 'low'));
      };
      many.addEventListener('click', () => { save({ ...s, motion: 'full' }); apply(); paintMotion(); });
      few.addEventListener('click', () => { save({ ...s, motion: 'low' }); apply(); paintMotion(); });
      mvSeg.append(many, few);
      mvSec.append(mvHead, mvSeg, el('p', 'note', '重く感じたら「少なめ」に。背景の揺れと舞う飾りが止まります'));
      paintMotion();

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

      // ---- 対局の曲：曲目の一覧。選んだ行に朱の「此」、右の「聴」でその場で流す ----
      const bgSec = el('section', 'set-item');
      const bgHead = el('h2', '', '対局の曲');
      bgHead.id = 'set-bgm';
      const list = el('ul', 'bgm-list');
      list.setAttribute('role', 'group');
      list.setAttribute('aria-labelledby', 'set-bgm');
      let listening: MusicName | null = null;
      const bgmPicks: { id: Settings['bgm']; b: HTMLButtonElement }[] = [];
      const ears: { id: MusicName; b: HTMLButtonElement }[] = [];
      const paintBgm = (): void => {
        for (const { id, b } of bgmPicks) b.setAttribute('aria-pressed', String(s.bgm === id));
        for (const { id, b } of ears) {
          const on = listening === id;
          b.setAttribute('aria-pressed', String(on));
          b.textContent = on ? '止' : '聴';
          b.setAttribute('aria-label', `${MATCH_TRACK_LABEL[id as keyof typeof MATCH_TRACK_LABEL]}を${on ? '止める' : '試聴する'}`);
        }
      };
      const bgmRow = (id: Settings['bgm'], label: string, sub?: string): HTMLLIElement => {
        const li = el('li', 'bgm-row');
        const b = button('bgm-pick', label);
        if (sub) b.append(el('small', '', sub));
        b.addEventListener('click', () => { save({ ...s, bgm: id }); paintBgm(); });
        bgmPicks.push({ id, b });
        li.append(b);
        return li;
      };
      for (const id of MATCH_TRACKS) {
        const li = bgmRow(id, MATCH_TRACK_LABEL[id]);
        const ear = button('bgm-listen', '聴');
        ear.addEventListener('click', () => {
          // 同じ曲をもう一度押したら止めて、設定の画面の曲（タイトルの曲）へ戻す
          listening = listening === id ? null : id;
          getSound().unlock();
          getSound().music(listening ?? 'title');
          paintBgm();
        });
        ears.push({ id, b: ear });
        li.append(ear);
        list.append(li);
      }
      list.append(bgmRow('random', 'おまかせ', '毎局どれか'));
      bgSec.append(bgHead, list);
      paintBgm();

      // ---- 王を取る演出（仮の3案）：決めた1案か、毎局くじ。選んだ行に朱の「此」 ----
      const kfSec = el('section', 'set-item');
      const kfHead = el('h2', '', '王を取る演出');
      kfHead.id = 'set-kingfx';
      const kfList = el('ul', 'bgm-list');
      kfList.setAttribute('role', 'group');
      kfList.setAttribute('aria-labelledby', 'set-kingfx');
      const kfPicks: { id: KingFxChoice; b: HTMLButtonElement }[] = [];
      const paintKf = (): void => {
        for (const { id, b } of kfPicks) b.setAttribute('aria-pressed', String(s.kingFx === id));
      };
      const kfRow = (id: KingFxChoice, label: string, sub?: string): HTMLLIElement => {
        const li = el('li', 'bgm-row');
        const b = button('bgm-pick', label);
        if (sub) b.append(el('small', '', sub));
        b.addEventListener('click', () => { save({ ...s, kingFx: id }); paintKf(); });
        kfPicks.push({ id, b });
        li.append(b);
        return li;
      };
      kfList.append(kfRow('random', 'おまかせ', '対局の始まりにくじ'));
      for (const id of KING_FX) kfList.append(kfRow(id, KING_FX_LABEL[id]));
      kfSec.append(kfHead, kfList, el('p', 'note', '勝ちも負けも同じ演出です。友と対局では誘った側の設定で決まります'));
      paintKf();

      // ---- 名の由来：題字と同じ筆の「傾」と、傾奇者の話 ----
      const nameSec = el('section', 'set-item name-origin');
      const nameHead = el('h2', '', '名の由来');
      const mark = el('span', 'origin-ji');
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = `<svg viewBox="-20 -20 ${TITLE_EM + 40} ${TITLE_EM + 40}"><path d="${TITLE_GLYPHS['傾']}" fill="currentColor" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/></svg>`; // 定数だけでできた文字列
      const furi = el('span', 'origin-furi', 'かぶく');
      furi.setAttribute('aria-hidden', 'true');
      const markBox = el('div', 'origin-mark');
      markBox.append(furi, mark);
      const text = el('div', 'origin-text');
      // 文節ごとに区切り、言葉の途中では折り返さない（画面の幅で切れ目が変わっても読みやすく）
      const phrases = (p: HTMLElement, parts: string[]): HTMLElement => {
        for (const t of parts) p.append(el('span', 'ph', t));
        return p;
      };
      text.append(
        phrases(el('p'), ['「傾く', '（かぶく）」は、', 'まわりが', '目を', '丸くするほど', '派手な', '身なりや、', '型破りな', 'ふるまいを', 'すること。',
          '戦国の', '終わりから', '江戸の', 'はじめ、', 'そんな', '人たちは', '「傾奇者', '（かぶきもの）」と', '呼ばれ、', '歌舞伎の', '名も', 'ここから', '生まれました。']),
        phrases(el('p'), ['定跡に', '従わず、', '札で', '盤を', 'ひっくり返す。', 'この', '将棋の', '名は、', 'その', '心意気から', '取りました。']),
      );
      const body = el('div', 'origin-body');
      body.append(markBox, text);
      nameSec.append(nameHead, body);

      // ---- クレジット：ふだんは見出しだけ。押すと字体・部品の名前と作り手、約束が開く（全文はさらに中で畳む） ----
      const crSec = el('section', 'set-item credits');
      const crBox = el('details', 'credit-box');
      const crList = el('dl', 'credit-list');
      for (const c of CREDITS) {
        const dt = el('dt', '', c.what);
        const dd = el('dd');
        dd.append(el('b', '', c.name), el('span', 'by', c.by), el('span', 'lic', c.license));
        crList.append(dt, dd);
      }
      const made = el('p', 'credit-made', '開発：maosun-dev（maosun-dev.com）');
      const full = el('details', 'credit-full');
      full.append(el('summary', '', 'ライセンスの全文'), el('p', 'lic-head', 'MIT License（three.js・Capacitor・@capacitor/preferences・@capacitor-community/admob）'),
        el('pre', '', MIT_TEXT), el('p', 'lic-head', 'SIL Open Font License 1.1'), el('p', '', OFL_NOTE));
      const crHead = el('summary');
      crHead.append(el('h2', '', 'クレジット'));
      crBox.append(crHead, crList, made, full);
      crSec.append(crBox);

      // 項目は和紙の一枚に墨で書く（舞台の絵の上でも読めるように）
      const sheet = el('div', 'sheet');
      sheet.append(stSec, mvSec, fxSec, volSec, bgSec, kfSec, nameSec, crSec);
      box.append(pageHead('設定', 'title'), sheet);
      root.append(box);
    },
    unmount() { clearTimeout(timer); },
  };
}
