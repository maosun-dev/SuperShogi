// アイコンの地：振袖の柄（傾奇者らしい華やかさ）。駒の後ろに敷く。
// 雲取り（雲の形の区切り）の中に青海波・麻の葉、大輪の牡丹・菊、桜、金の流水。どれも手で描いた形を式で並べる（画像は使わない）。
// 色は src/view/palette.ts の名前付きの色だけ。
import { PALS as P } from '../../src/view/palette.ts';

const S = 1024;
const f = (n) => Math.round(n * 10) / 10;

/** 決まった種から同じ並びの乱数（何度作っても同じ絵） */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 雲取り：上下のふちが小さな丸の連なりになった横長の帯（両端は丸） */
function cloudBand(x0, x1, cy, h, bumps) {
  const r = h / 2;
  const seg = (x1 - x0) / bumps;
  let d = `M${f(x0)} ${f(cy - r)}`;
  for (let i = 0; i < bumps; i++) d += ` A${f(seg / 2)} ${f(seg / 2.6)} 0 0 1 ${f(x0 + seg * (i + 1))} ${f(cy - r)}`;
  d += ` A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(cy + r)}`;
  for (let i = bumps; i > 0; i--) d += ` A${f(seg / 2)} ${f(seg / 2.6)} 0 0 1 ${f(x0 + seg * (i - 1))} ${f(cy + r)}`;
  d += ` A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(cy - r)}Z`;
  return d;
}

/** 青海波：扇の重なり。上の段から描いて、下の段が上に重なる */
function seigaiha(x0, y0, x1, y1, r, base, line) {
  let out = '';
  for (let j = 0, y = y0; y < y1 + r; j++, y += r / 2) {
    for (let x = x0 + (j % 2 ? r : 0) - 2 * r; x < x1 + 2 * r; x += 2 * r) {
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${base}"/>`;
      for (const k of [1, 0.75, 0.5, 0.25]) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * k - 3)}" fill="none" stroke="${line}" stroke-width="4"/>`;
    }
  }
  return out;
}

/** 麻の葉：正三角形の格子の各三角形を、頂点から重心への線で割る */
function asanoha(x0, y0, x1, y1, s, line) {
  const h = (s * Math.sqrt(3)) / 2;
  let d = '';
  for (let j = -1, y = y0 - h; y < y1 + h; j++, y += h) {
    const off = j % 2 ? s / 2 : 0;
    for (let x = x0 - s + off; x < x1 + s; x += s) {
      // 上向きの三角形と下向きの三角形
      for (const tri of [
        [[x, y + h], [x + s, y + h], [x + s / 2, y]],
        [[x + s / 2, y], [x + s * 1.5, y], [x + s, y + h]],
      ]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        d += `M${f(tri[0][0])} ${f(tri[0][1])}L${f(tri[1][0])} ${f(tri[1][1])}L${f(tri[2][0])} ${f(tri[2][1])}Z`;
        for (const [px, py] of tri) d += `M${f(px)} ${f(py)}L${f(cx)} ${f(cy)}`;
      }
    }
  }
  return `<path d="${d}" fill="none" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>`;
}

/** 桜：5枚の花びら（先に切れ込み）と金のしべ */
function sakura(cx, cy, r, rot, petal, edge, heart) {
  const p = `M0 0C${f(-0.62 * r)} ${f(-0.3 * r)} ${f(-0.55 * r)} ${f(-0.98 * r)} ${f(-0.16 * r)} ${f(-r)}L0 ${f(-0.82 * r)}L${f(0.16 * r)} ${f(-r)}C${f(0.55 * r)} ${f(-0.98 * r)} ${f(0.62 * r)} ${f(-0.3 * r)} 0 0Z`;
  let out = `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)})">`;
  for (let k = 0; k < 5; k++) out += `<path d="${p}" transform="rotate(${k * 72})" fill="${petal}" stroke="${edge}" stroke-width="${f(Math.max(2, r * 0.06))}" stroke-linejoin="round"/>`;
  out += `<circle r="${f(r * 0.17)}" fill="${heart}"/></g>`;
  return out;
}

/** 牡丹：外から内へ、ふちの波打つ花びらを3重に重ねる */
function botan(cx, cy, r, petal, shade, edge, heart) {
  const rnd = seeded(7);
  let out = `<g transform="translate(${f(cx)} ${f(cy)})">`;
  const rings = [[1, 9, petal], [0.74, 8, shade], [0.5, 7, petal], [0.3, 6, shade]];
  for (const [k, n, fill] of rings) {
    const R = r * k;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 + rnd() * 14 + k * 30;
      const w = (R * 0.62);
      // 波打つ先：3つの小さなこぶ
      const d = `M0 0C${f(-w)} ${f(-R * 0.25)} ${f(-w * 0.9)} ${f(-R * 0.9)} ${f(-w * 0.45)} ${f(-R)}`
        + `Q${f(-w * 0.22)} ${f(-R * 1.08)} 0 ${f(-R * 0.96)}Q${f(w * 0.22)} ${f(-R * 1.08)} ${f(w * 0.45)} ${f(-R)}`
        + `C${f(w * 0.9)} ${f(-R * 0.9)} ${f(w)} ${f(-R * 0.25)} 0 0Z`;
      out += `<path d="${d}" transform="rotate(${f(a)})" fill="${fill}" stroke="${edge}" stroke-width="3" stroke-linejoin="round"/>`;
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    out += `<circle cx="${f(Math.cos(a) * r * 0.1)}" cy="${f(Math.sin(a) * r * 0.1)}" r="${f(r * 0.05)}" fill="${heart}"/>`;
  }
  return out + '</g>';
}

/** 菊：細い花びらを2重に放射状に */
function kiku(cx, cy, r, fill, edge) {
  let out = `<g transform="translate(${f(cx)} ${f(cy)})">`;
  for (const [k, n, off] of [[1, 28, 0], [0.66, 22, 6]]) {
    const R = r * k;
    const w = R * 0.11;
    for (let i = 0; i < n; i++) {
      out += `<path d="M0 ${f(-R * 0.12)}C${f(-w)} ${f(-R * 0.5)} ${f(-w)} ${f(-R * 0.92)} 0 ${f(-R)}C${f(w)} ${f(-R * 0.92)} ${f(w)} ${f(-R * 0.5)} 0 ${f(-R * 0.12)}Z" transform="rotate(${f((i / n) * 360 + off)})" fill="${fill}" stroke="${edge}" stroke-width="2.5"/>`;
    }
  }
  return out + `<circle r="${f(r * 0.16)}" fill="${edge}"/></g>`;
}

/** 金の流水：ゆるく波打つ帯を何本か */
function ryusui(y, amp, len, color, width) {
  let d = `M-40 ${f(y)}`;
  const n = 6;
  const seg = (S + 80) / n;
  for (let i = 0; i < n; i++) {
    const x = -40 + seg * i;
    d += ` C${f(x + seg * 0.3)} ${f(y - amp)} ${f(x + seg * 0.7)} ${f(y + amp)} ${f(x + seg)} ${f(y)}`;
  }
  void len;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

/**
 * 地の SVG（defs と描画）。variant：
 *  'beni' 紅の振袖：紅の地に、藍の青海波と胡粉の麻の葉の雲取り（金のふち）、胡粉の大輪の牡丹、桜
 *  'kuro' 黒の振袖：墨の地に金の流水、金の菊、紅と胡粉の桜、紅の雲取り
 */
export function furisodeGround(variant) {
  if (variant === 'beni') {
    const upper = cloudBand(-60, 640, 190, 230, 6);
    const lower = cloudBand(380, 1090, 830, 240, 6);
    return `<defs>
  <clipPath id="kumoA"><path d="${upper}"/></clipPath>
  <clipPath id="kumoB"><path d="${lower}"/></clipPath>
</defs>
<rect width="${S}" height="${S}" fill="${P.wana}"/>
<g fill="none" stroke="${P.wanaDeep}" stroke-width="5" opacity="0.55">${ryusui(560, 36, 0, P.wanaDeep, 5)}${ryusui(610, 36, 0, P.wanaDeep, 5)}</g>
<g clip-path="url(#kumoA)"><rect x="-80" y="40" width="760" height="320" fill="${P.yoru}"/>${seigaiha(-60, 60, 660, 340, 52, P.yoru, P.mahou)}</g>
<path d="${upper}" fill="none" stroke="${P.soubi}" stroke-width="10"/>
<g clip-path="url(#kumoB)"><rect x="360" y="680" width="760" height="320" fill="${P.gofun}"/>${asanoha(360, 690, 1100, 990, 64, P.wana)}</g>
<path d="${lower}" fill="none" stroke="${P.soubi}" stroke-width="10"/>
${botan(830, 300, 210, P.gofun, P.kayaLight, P.wanaDeep, P.soubi)}
${sakura(120, 610, 70, 12, P.gofun, P.wanaDeep, P.soubi)}
${sakura(250, 905, 52, -20, P.gofun, P.wanaDeep, P.soubi)}
${sakura(960, 590, 44, 30, P.gofun, P.wanaDeep, P.soubi)}
${sakura(60, 360, 34, 5, P.kayaLight, P.wanaDeep, P.soubi)}`;
  }
  if (variant === 'kuro') {
    const band = cloudBand(-80, 560, 860, 220, 5);
    let water = '';
    for (const [y, a] of [[420, 40], [470, 40], [520, 40], [690, 30], [735, 30]]) water += ryusui(y, a, 0, P.soubi, 7);
    return `<defs><clipPath id="kumoK"><path d="${band}"/></clipPath></defs>
<rect width="${S}" height="${S}" fill="${P.sumi}"/>
<g opacity="0.9">${water}</g>
<g clip-path="url(#kumoK)"><rect x="-100" y="720" width="700" height="300" fill="${P.wana}"/>${seigaiha(-80, 740, 580, 980, 46, P.wana, P.wanaDeep)}</g>
<path d="${band}" fill="none" stroke="${P.soubi}" stroke-width="10"/>
${kiku(820, 250, 220, P.soubi, P.kayaGrainDeep)}
${sakura(150, 210, 86, 8, P.wana, P.wanaDeep, P.soubi)}
${sakura(300, 120, 50, -24, P.gofun, P.wanaDeep, P.soubi)}
${sakura(940, 640, 58, 18, P.gofun, P.wanaDeep, P.soubi)}
${sakura(820, 930, 70, -6, P.wana, P.wanaDeep, P.soubi)}
${sakura(60, 560, 40, 30, P.gofun, P.wanaDeep, P.soubi)}`;
  }
  throw new Error(`知らない地：${variant}`);
}
