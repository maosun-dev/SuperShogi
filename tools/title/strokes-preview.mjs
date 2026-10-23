// 筆文字の通り道（src/fx/brushGlyphs.ts の strokes）を確かめる絵を書き出す道具。
// 字ごとに2枚並べた PNG：左＝輪郭（灰）に通り道（色つきの線・画の番号）を重ねたもの、
// 右＝通り道で塗れた所（墨）と塗り残し（赤）。赤が多い所は、書き終わりで輪郭を重ねるまで欠けて見える。
// 使い方：node tools/title/strokes-preview.mjs <出力フォルダ>
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { BRUSH_GLYPHS } from '../../src/fx/brushGlyphs.ts';

const out = process.argv[2];
if (!out) {
  console.error('使い方：node tools/title/strokes-preview.mjs <出力フォルダ>');
  process.exit(1);
}
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#800000', '#808000', '#000075'];

Object.entries(BRUSH_GLYPHS).forEach(([ch, g], k) => {
  const lines = g.strokes.map((s, i) =>
    `<path d="${s.d}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-opacity=".55" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const nums = g.strokes.map((s, i) => {
    const [x, y] = s.d.match(/-?\d+/g).map(Number);
    return `<text x="${x}" y="${y}" font-size="44" font-weight="bold" fill="${COLORS[i % COLORS.length]}">${i + 1}</text>`;
  }).join('');
  const cover = g.strokes.map((s) =>
    `<path d="${s.d}" fill="none" stroke="#111" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024">
<rect width="2048" height="1024" fill="#fff"/>
<path d="${g.d}" fill="#bbb"/>${lines}${nums}
<g transform="translate(1024 0)"><clipPath id="c"><path d="${g.d}"/></clipPath>
<path d="${g.d}" fill="#e33"/><g clip-path="url(#c)">${cover}</g></g>
</svg>`;
  writeFileSync(`${out}/stroke-${k}.png`, new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
  console.log(`stroke-${k}.png ${ch}`);
});
