// TrueType フォント（.ttf）から、指定した字の形を SVG の path（d 属性）として書き出す小さな道具。
// 題字は「超・将・棋」の3文字の形だけをアプリに入れる（フォントのファイルは配らない）ために使う。
// 使い方：node tools/title/glyphs.mjs <フォント.ttf> <字> > 出力.json
// 出力：{ unitsPerEm, ascent, descent, glyphs: { 字: { d, advance } } }。座標は y を下向きに直してある
import { readFileSync } from 'node:fs';

const [, , fontPath, chars] = process.argv;
if (!fontPath || !chars) {
  console.error('使い方：node tools/title/glyphs.mjs <フォント.ttf> <字>');
  process.exit(1);
}
const buf = readFileSync(fontPath);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const u16 = (o) => dv.getUint16(o), i16 = (o) => dv.getInt16(o), u32 = (o) => dv.getUint32(o);

// 表の場所
const tables = {};
const numTables = u16(4);
for (let i = 0; i < numTables; i++) {
  const r = 12 + i * 16;
  const tag = String.fromCharCode(buf[r], buf[r + 1], buf[r + 2], buf[r + 3]);
  tables[tag] = u32(r + 8);
}
for (const t of ['head', 'cmap', 'loca', 'glyf', 'hhea', 'hmtx', 'maxp']) {
  if (tables[t] === undefined) throw new Error(`表 ${t} がありません（TrueType の .ttf だけ読めます）`);
}
const unitsPerEm = u16(tables.head + 18);
const longLoca = i16(tables.head + 50) === 1;
const ascent = i16(tables.hhea + 4), descent = i16(tables.hhea + 6);
const numHMetrics = u16(tables.hhea + 34);

// 文字 → 字形の番号（cmap の形式4。基本多言語面だけ）
function glyphIndex(code) {
  const cm = tables.cmap;
  const n = u16(cm + 2);
  for (let i = 0; i < n; i++) {
    const pid = u16(cm + 4 + i * 8), eid = u16(cm + 6 + i * 8), off = u32(cm + 8 + i * 8);
    const sub = cm + off;
    if (pid === 3 && (eid === 1 || eid === 10) && u16(sub) === 4) {
      const segX2 = u16(sub + 6);
      const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = u16(ends + s * 2), start = u16(starts + s * 2);
        if (code < start || code > end) continue;
        const delta = i16(deltas + s * 2), ro = u16(ranges + s * 2);
        if (ro === 0) return (code + delta) & 0xffff;
        const g = u16(ranges + s * 2 + ro + (code - start) * 2);
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
    }
  }
  return 0;
}

const locaAt = (g) => (longLoca ? u32(tables.loca + g * 4) : u16(tables.loca + g * 2) * 2);
const advanceOf = (g) => u16(tables.hmtx + Math.min(g, numHMetrics - 1) * 4);

// 字形の輪郭（点の列の配列）。複合字形は部品を足し合わせる（平行移動だけ扱う）
function contours(g, dx = 0, dy = 0) {
  const start = locaAt(g), end = locaAt(g + 1);
  if (end === start) return [];
  const p = tables.glyf + start;
  const nC = i16(p);
  if (nC < 0) {
    let q = p + 10, out = [], flags;
    do {
      flags = u16(q); const sub = u16(q + 2); q += 4;
      let ax, ay;
      if (flags & 1) { ax = i16(q); ay = i16(q + 2); q += 4; } else { ax = dv.getInt8(q); ay = dv.getInt8(q + 1); q += 2; }
      if (flags & 8) q += 2; else if (flags & 0x40) q += 4; else if (flags & 0x80) q += 8;
      out = out.concat(contours(sub, dx + ax, dy + ay));
    } while (flags & 0x20);
    return out;
  }
  const endPts = [];
  for (let i = 0; i < nC; i++) endPts.push(u16(p + 10 + i * 2));
  const nPts = endPts[nC - 1] + 1;
  let q = p + 10 + nC * 2;
  q += 2 + u16(q); // 命令を飛ばす
  const flags = [];
  while (flags.length < nPts) {
    const f = buf[q++]; flags.push(f);
    if (f & 8) { const rep = buf[q++]; for (let r = 0; r < rep; r++) flags.push(f); }
  }
  const xs = [], ys = [];
  let x = 0;
  for (const f of flags) {
    if (f & 2) { const v = buf[q++]; x += f & 16 ? v : -v; } else if (!(f & 16)) { x += i16(q); q += 2; }
    xs.push(x);
  }
  let y = 0;
  for (const f of flags) {
    if (f & 4) { const v = buf[q++]; y += f & 32 ? v : -v; } else if (!(f & 32)) { y += i16(q); q += 2; }
    ys.push(y);
  }
  const out = [];
  let s = 0;
  for (const e of endPts) {
    const c = [];
    for (let i = s; i <= e; i++) c.push({ x: xs[i] + dx, y: ys[i] + dy, on: !!(flags[i] & 1) });
    out.push(c);
    s = e + 1;
  }
  return out;
}

// 輪郭 → SVG の d（二次ベジェ。y は上向きのフォント座標を下向きに直す：Y = ascent - y）
function toPath(cs) {
  const r = (n) => Math.round(n);
  let d = '';
  for (const c of cs) {
    if (c.length === 0) continue;
    const pts = c.map((p) => ({ x: p.x, y: ascent - p.y, on: p.on }));
    // 始点は on の点。なければ最初の2点の中点
    let startIdx = pts.findIndex((p) => p.on);
    let start;
    if (startIdx < 0) { start = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true }; startIdx = 0; } else start = pts[startIdx];
    d += `M${r(start.x)} ${r(start.y)}`;
    const n = pts.length;
    let ctrl = null;
    for (let k = 1; k <= n; k++) {
      const p = pts[(startIdx + k) % n];
      if (p.on) {
        d += ctrl ? `Q${r(ctrl.x)} ${r(ctrl.y)} ${r(p.x)} ${r(p.y)}` : `L${r(p.x)} ${r(p.y)}`;
        ctrl = null;
      } else if (ctrl) {
        const mid = { x: (ctrl.x + p.x) / 2, y: (ctrl.y + p.y) / 2 };
        d += `Q${r(ctrl.x)} ${r(ctrl.y)} ${r(mid.x)} ${r(mid.y)}`;
        ctrl = p;
      } else ctrl = p;
    }
    if (ctrl) d += `Q${r(ctrl.x)} ${r(ctrl.y)} ${r(start.x)} ${r(start.y)}`;
    d += 'Z';
  }
  return d;
}

const glyphs = {};
for (const ch of chars) {
  const g = glyphIndex(ch.codePointAt(0));
  if (!g) throw new Error(`「${ch}」がフォントにありません`);
  glyphs[ch] = { d: toPath(contours(g)), advance: advanceOf(g) };
}
process.stdout.write(JSON.stringify({ unitsPerEm, ascent, descent, glyphs }));
