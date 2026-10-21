// iPhone アプリのアイコンと起動画面の PNG を作り、Xcode の Assets.xcassets に置く。
// 使い方：npm run icon
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import decompress from 'wawoff2/decompress.js';
import { iconSvg } from './icon.mjs';
import { PALS } from '../../src/view/palette.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const assets = join(root, 'ios', 'App', 'App', 'Assets.xcassets');
const FAMILY = 'Yuji Boku';
const CHAR = 0x8d85; // 超

/** unicode-range（U+8d85, U+592a-592b など）に cp が入っているか */
function rangeHas(range, cp) {
  return range.split(',').some((part) => {
    const m = part.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
    if (!m) return false;
    if (m[1].includes('?')) {
      const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
      const hi = parseInt(m[1].replace(/\?/g, 'f'), 16);
      return cp >= lo && cp <= hi;
    }
    const lo = parseInt(m[1], 16);
    const hi = m[2] ? parseInt(m[2], 16) : lo;
    return cp >= lo && cp <= hi;
  });
}

/** 400.css から「超」を含む woff2 の場所を探す */
function findWoff2() {
  const dir = join(root, 'node_modules', '@fontsource', 'yuji-boku');
  const css = readFileSync(join(dir, '400.css'), 'utf8');
  for (const block of css.split('@font-face').slice(1)) {
    const range = block.match(/unicode-range:\s*([^;]+);/);
    const src = block.match(/url\(([^)]+\.woff2)\)/);
    if (range && src && rangeHas(range[1], CHAR)) return join(dir, src[1].replace(/^\.\//, ''));
  }
  throw new Error('「超」を含む Yuji Boku の woff2 が見つからない');
}

/** SVG を不透明な RGB の PNG に（背景を夜の藍で塗りつぶし、透明の層を持たない形で書く） */
function render(svg, width) {
  const r = new Resvg(svg, {
    background: PALS.yoru,
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: [ttfPath], loadSystemFonts: false, defaultFontFamily: FAMILY },
  });
  const img = r.render();
  return rgbPng(img.width, img.height, img.pixels);
}

/** RGBA の画素から、色の種類 2（RGB・透明なし）の PNG を組み立てる */
function rgbPng(w, h, rgba) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // 行ごとの前処理なし
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = row + 1 + x * 3;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 1色 8bit
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const tmp = mkdtempSync(join(tmpdir(), 'supershogi-icon-'));
const ttfPath = join(tmp, 'yuji-boku-8d85.ttf');
try {
  const woff2 = findWoff2();
  writeFileSync(ttfPath, await decompress(readFileSync(woff2)));

  const icon = render(iconSvg(FAMILY), 1024);
  writeFileSync(join(assets, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), icon);
  // 確かめ用：--preview=<フォルダ> で 60px に縮めたものも書く（Xcode には置かない）
  const preview = process.argv.find((a) => a.startsWith('--preview='));
  if (preview) writeFileSync(join(preview.slice(10), 'icon-60.png'), render(iconSvg(FAMILY), 60));

  // 起動画面：夜の藍の無地
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="${PALS.yoru}"/></svg>`;
  const splash = render(splashSvg, 2732);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    writeFileSync(join(assets, 'Splash.imageset', name), splash);
  }
  console.log(`アイコンと起動画面を書き出した（字体：${basename(woff2)}）`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
