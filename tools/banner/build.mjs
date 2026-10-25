// X の投稿に添えるバナー（x-banner.html）を PNG に書き出す。
// 題字の形を src/app/titleGlyphs.ts から差し込み、画面なしの Chrome で 1200×675 を撮る。
// 画面写真は .superpowers/store-shots/6.3（App Store 用に撮ったもの）を使う。
//   node tools/banner/build.mjs [出力先]   （既定 docs/mockups/x-banner.png）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.argv[2] || join(ROOT, 'docs/mockups/x-banner.png'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 題字の形（1文字 1024×1024）。アプリのタイトルと同じく、縁を太い線で先に描いてから字を塗る
const src = readFileSync(join(ROOT, 'src/app/titleGlyphs.ts'), 'utf8');
const glyphs = Object.fromEntries([...src.matchAll(/'(.)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
const brushChar = (ch, fill, rim, rimW, thick) =>
  `<svg viewBox="-40 -40 1104 1104" aria-hidden="true">`
  + `<path d="${glyphs[ch]}" style="fill:${rim};stroke:${rim}" stroke-width="${rimW}" stroke-linejoin="round"/>`
  + `<path d="${glyphs[ch]}" style="fill:${fill};stroke:${fill}" stroke-width="${thick}" stroke-linejoin="round"/></svg>`;

let html = readFileSync(join(ROOT, 'tools/banner/x-banner.html'), 'utf8')
  .replace('{{傾}}', brushChar('傾', 'var(--sumi)', 'var(--gofun)', 80, 18))
  .replace('{{将}}', brushChar('将', 'var(--gofun)', 'var(--sumi)', 110, 24))
  .replace('{{棋}}', brushChar('棋', 'var(--gofun)', 'var(--sumi)', 110, 24))
  .replaceAll('{{ROOT}}', pathToFileURL(ROOT).href);

const page = join(tmpdir(), 'kabukishogi-x-banner.html');
writeFileSync(page, html);
mkdirSync(dirname(OUT), { recursive: true });
execFileSync(CHROME, [
  '--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
  '--window-size=1200,675', '--virtual-time-budget=8000', `--screenshot=${OUT}`, pathToFileURL(page).href,
], { stdio: 'inherit' });
console.log('saved', OUT);
