// App Store 用の画面写真（6.9インチ 1320×2868）を、開発用のサーバーから撮る。
// パソコンの Chrome を画面なしで動かし、iPhone の大きさで表示して場面ごとに保存する（転落牌の tools/shots と同じ作り）。
// 演出の場面は、決まった間をあけて何枚か撮り（-1, -2 …）、あとで良いものを選ぶ。
// 使い方：先に npm run dev（5173）を動かしておく
//   node tools/shots/appstore-shots.mjs [出力フォルダ] [SCENE=title,deck,...]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT = process.argv[2] || 'shots-out';
const BASE = 'http://localhost:5173/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const [W, H, DPR] = [440, 956, 3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const prof = join(tmpdir(), 'kabukishogi-shots-profile');
rmSync(prof, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--no-first-run',
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0; const pend = {};
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* まだ起きていない */ }
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } });
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
};
// 開発用の切り替えの帯は写さない
const HIDE_DEV = `(()=>{const b=document.getElementById('fx-picker');if(b)b.style.display='none';return 1})()`;
const shot = async (name) => {
  await ev(HIDE_DEV);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };
// 文字で探して押す
const clickText = (sel, text) => ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(b){b.click();return 1}return 0})()`);
const space = () => ev(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));1`);

async function load(query = '', setup = '') {
  await send('Page.navigate', { url: BASE });
  await sleep(800);
  await ev(`localStorage.clear();${setup};'ok'`);
  await send('Page.navigate', { url: BASE + query });
  await waitFor(`!!document.querySelector('[data-screen]')`, 30000);
  await ev(`document.fonts.ready.then(()=>1)`);
  await sleep(3000);
}
// 演出を流して、間をあけて何枚も撮る
async function burst(name, startMs, everyMs, count) {
  await sleep(startMs);
  for (let i = 1; i <= count; i++) { await shot(`${name}-${i}`); await sleep(everyMs); }
}

await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });

const ONLY = process.env.SCENE || '';
const want = (n) => !ONLY || ONLY.split(',').includes(n);

if (want('title')) {
  await load('?link=fake');
  await sleep(2000);
  await shot('title');
}
if (want('rakurai')) {
  await load('?fx=rakurai&cpu=normal');
  await space();
  await burst('rakurai', 300, 450, 14);
}
if (want('equips')) {
  await load('?fx=equips');
  await shot('equips');
}
if (want('hanabi')) {
  await load('?fx=win&king=hanabi');
  await space();
  await burst('hanabi', 500, 600, 16);
}
if (want('iai')) {
  await load('?fx=win&king=iai');
  await space();
  await burst('iai', 500, 500, 14);
}
if (want('deck')) {
  await load('');
  await clickText('button', '対局');
  await sleep(4000);
  await shot('level');
  await ev(`document.querySelector('.level-fuda.strong').click();1`);
  await sleep(4000);
  // 札を持ち込んだ姿にする
  await clickText('button', 'おまかせ');
  await sleep(1500);
  await shot('deck');
}
if (want('zukan')) {
  await load('');
  await clickText('button', '札図鑑');
  await sleep(4500);
  await shot('zukan');
}
if (want('howto')) {
  await load('');
  await clickText('button', '学');
  await sleep(4500);
  await shot('howto');
}

ws.close(); chrome.kill();
console.log('done');
