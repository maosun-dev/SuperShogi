// 大詰の3人の札に敷く柄（SVG）。札いっぱいに敷き、名前・戦績・札はこの上に重ねる。
// 鬼＝紅と金の鱗文様（鬼女や大蛇の化身が着る三角の柄）に隈取の紅の払い。
// 師範＝藍の地に金の亀甲（六角形の格子）と胡粉の花菱、右に白菊の丸紋。
// 傾奇者＝黒の振袖：金の流水、紅の雲取りに金の青海波、大輪の牡丹・金の菊・紅白の桜（アイコンの紅の振袖とは別の柄）。
// 画像は使わず、手で決めた形を式で並べる。色は palette と同じ名前付きの色だけ。
// id は札ごとの頭文字を付けて、同じ画面に3枚並べてもぶつからないようにする
import { JOMAKU, OOZUME, type Level } from '../../ai/levels';
import type { LevelAct } from '../storage';

export type OozumeLevel = 'oni' | 'shihan' | 'kabuki';

// palette.ts と style.css の :root と同じ値
const C = {
  sumi: '#1d1a17', yoru: '#14213D', yoruLight: '#22386a', wana: '#D7263D', wanaDeep: '#7a0f1c',
  soubi: '#C9A227', kayaLight: '#F2D594', gofun: '#EEE8DC', sakura: '#F4A3AE',
} as const;

const W = 300, H = 80; // 札の横長の比（実際の大きさは札に合わせて切り取る）
const f = (n: number): string => String(Math.round(n * 10) / 10);
const svg = (body: string): string =>
  `<svg class="gara" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">${body}</svg>`;

/** 幕ごとの強さの並び */
export function actLevels(act: LevelAct): readonly Level[] {
  return act === 'oo' ? OOZUME : JOMAKU;
}

// ---- 鬼 ----
function oni(): string {
  // 鱗：上向きの三角を段ごとに半分ずらして敷く。ところどころ金箔の鱗
  const tw = 20, th = 16;
  let scales = '';
  for (let row = 0; row * th < H + th; row++) {
    const off = row % 2 ? tw / 2 : 0;
    for (let col = -1; col * tw < W + tw; col++) {
      const x = col * tw + off, y = row * th;
      const gold = (row * 7 + col * 3) % 11 === 0;
      const fill = gold ? C.soubi : (row + col) % 3 === 0 ? C.wana : C.wanaDeep;
      scales += `<path d="M${f(x)} ${f(y + th)}L${f(x + tw / 2)} ${f(y)}L${f(x + tw)} ${f(y + th)}Z" fill="${fill}"/>`;
    }
  }
  // 隈取の払い：右下から右上へ、太く入って細く抜ける紅の筆
  const stroke = (x0: number, y0: number, x1: number, y1: number, w: number): string =>
    `<path d="M${f(x0)} ${f(y0)}C${f(x0 + 40)} ${f(y0 - 30)} ${f(x1 - 60)} ${f(y1 + 10)} ${f(x1)} ${f(y1)}`
    + `C${f(x1 - 50)} ${f(y1 + 10 + w * 0.4)} ${f(x0 + 50)} ${f(y0 - 22 + w)} ${f(x0 + w)} ${f(y0)}Z" fill="${C.wana}"/>`;
  return svg(
    `<rect width="${W}" height="${H}" fill="${C.sumi}"/>`
    + `<g opacity=".85">${scales}</g>`
    + `<g fill="none" stroke="${C.kayaLight}" stroke-width=".5" opacity=".45">`
    + Array.from({ length: Math.ceil(H / th) + 1 }, (_, r) => `<path d="M0 ${f(r * th)}H${W}"/>`).join('') + '</g>'
    + stroke(150, 84, 304, 14, 16) + stroke(205, 86, 304, 46, 10)
    // 名前の下を少し沈めて字を読ませる（板にはしない）
    + `<rect width="${W}" height="${H}" fill="${C.sumi}" opacity=".18"/>`,
  );
}

// ---- 師範 ----
function shihan(): string {
  // 亀甲：平たい六角形の格子。辺 a、高さ h。1つの区画に六角形1つと、右の六角形へつなぐ横の辺
  const a = 8, h = Math.sqrt(3) * a;
  let lines = '', hana = '';
  const flower = (cx: number, cy: number): string => {
    const r = 2.6, q = 1.1;
    return `<path d="M${f(cx)} ${f(cy - r)}L${f(cx + q)} ${f(cy)}L${f(cx)} ${f(cy + r)}L${f(cx - q)} ${f(cy)}Z`
      + `M${f(cx - r)} ${f(cy)}L${f(cx)} ${f(cy - q)}L${f(cx + r)} ${f(cy)}L${f(cx)} ${f(cy + q)}Z"/>`;
  };
  for (let row = -1; row * h < H + h; row++) {
    for (let col = -1; col * 3 * a < W + 3 * a; col++) {
      const x = col * 3 * a, y = row * h;
      lines += `M${f(x)} ${f(y + h / 2)}L${f(x + a / 2)} ${f(y)}L${f(x + 1.5 * a)} ${f(y)}L${f(x + 2 * a)} ${f(y + h / 2)}`
        + `L${f(x + 1.5 * a)} ${f(y + h)}L${f(x + a / 2)} ${f(y + h)}ZM${f(x + 2 * a)} ${f(y + h / 2)}L${f(x + 3 * a)} ${f(y + h / 2)}`;
      hana += flower(x + a, y + h / 2) + flower(x + 2.5 * a, y);
    }
  }
  // 白菊の丸紋（花びら12枚を2重。16枚の菊の御紋とは違う形にする）
  const cx = 262, cy = 40, R = 33;
  const petals = (n: number, r0: number, r1: number, w: number, rot: number, fill: string): string =>
    Array.from({ length: n }, (_, i) => {
      const t = ((i / n) * 360 + rot);
      return `<path d="M0 ${f(-r0)}C${f(-w)} ${f(-(r0 + r1) / 2)} ${f(-w * 0.7)} ${f(-r1)} 0 ${f(-r1)}C${f(w * 0.7)} ${f(-r1)} ${f(w)} ${f(-(r0 + r1) / 2)} 0 ${f(-r0)}Z" transform="rotate(${f(t)})" fill="${fill}"/>`;
    }).join('');
  // 戦績・目安の字がこの上に乗るので、紋は透かし（薄く）にする
  const kiku = `<g transform="translate(${cx} ${cy})" opacity=".42">`
    + `<circle r="${R}" fill="${C.yoru}" stroke="${C.soubi}" stroke-width="1.6"/>`
    + `<circle r="${R - 3}" fill="none" stroke="${C.soubi}" stroke-width=".6"/>`
    + petals(12, 5, 26, 5, 0, C.gofun) + petals(12, 4, 16, 3.6, 15, '#fbf7ef')
    + `<circle r="3.6" fill="${C.soubi}"/></g>`;
  return svg(
    `<rect width="${W}" height="${H}" fill="${C.yoru}"/>`
    + `<path d="${lines}" fill="none" stroke="${C.soubi}" stroke-width="1" opacity=".8"/>`
    + `<g fill="${C.gofun}" opacity=".7">${hana}</g>`
    + kiku,
  );
}

// ---- 傾奇者 ----
function kabuki(): string {
  // 雲取り：上下のふちが小さな丸の連なりになった帯
  const cloud = (x0: number, x1: number, cy: number, hh: number, bumps: number): string => {
    const seg = (x1 - x0) / bumps, r = hh / 2;
    let d = `M${f(x0)} ${f(cy - r)}`;
    for (let i = 0; i < bumps; i++) d += `A${f(seg / 2)} ${f(seg / 2.6)} 0 0 1 ${f(x0 + seg * (i + 1))} ${f(cy - r)}`;
    d += `A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(cy + r)}`;
    for (let i = bumps; i > 0; i--) d += `A${f(seg / 2)} ${f(seg / 2.6)} 0 0 1 ${f(x0 + seg * (i - 1))} ${f(cy + r)}`;
    return d + `A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(cy - r)}Z`;
  };
  const band = cloud(120, 330, 16, 30, 7);
  // 青海波：扇を段ごとに半分ずらして重ねる（上の段から描き、下の段が重なる）
  let waves = '';
  for (let row = 0; row < 9; row++) {
    const y = -6 + row * 5, off = row % 2 ? 10 : 0;
    for (let x = 110 + off; x < 340; x += 20) {
      waves += `<circle cx="${f(x)}" cy="${f(y)}" r="9.6" fill="${C.wana}"/>`;
      for (const k of [9.6, 6.6, 3.6]) waves += `<circle cx="${f(x)}" cy="${f(y)}" r="${k}" fill="none" stroke="${C.soubi}" stroke-width=".8"/>`;
    }
  }
  // 金の流水
  const flow = (y: number, amp: number): string =>
    `<path d="M-10 ${f(y)}C40 ${f(y - amp)} 70 ${f(y + amp)} 110 ${f(y)}S180 ${f(y - amp)} 220 ${f(y)}S290 ${f(y + amp)} 320 ${f(y - 2)}" fill="none" stroke="${C.soubi}" stroke-width="1.4" stroke-linecap="round"/>`;
  // 桜：先に切れ込みのある花びら5枚
  const pet = 'M0 0C-6 -3 -5.5 -9.8 -1.6 -10L0 -8.2L1.6 -10C5.5 -9.8 6 -3 0 0Z';
  const sakura = (x: number, y: number, s: number, rot: number, fill: string): string =>
    `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})">`
    + [0, 72, 144, 216, 288].map((r) => `<path d="${pet}" transform="rotate(${r})" fill="${fill}" stroke="${C.wanaDeep}" stroke-width=".7"/>`).join('')
    + `<circle r="1.8" fill="${C.soubi}"/></g>`;
  // 牡丹：波打つ花びらを3重に
  const bp = 'M0 0C-14 -6 -13 -20 -7 -23Q-3.5 -25 0 -22Q3.5 -25 7 -23C13 -20 14 -6 0 0Z';
  const ring = (n: number, s: number, rot: number, fill: string): string =>
    Array.from({ length: n }, (_, i) => `<path d="${bp}" transform="rotate(${f((i / n) * 360 + rot)}) scale(${s})" fill="${fill}" stroke="${C.wanaDeep}" stroke-width="${f(1 / s)}"/>`).join('');
  const botan = `<g transform="translate(262 50) scale(1.15)">${ring(9, 1, 0, C.wana)}${ring(7, 0.66, 20, C.sakura)}${ring(5, 0.36, 10, C.wana)}<circle r="3" fill="${C.soubi}"/></g>`;
  // 菊：細い花びらを2重に放射状
  const kp = 'M0 -3C-1.6 -9 -1.6 -16 0 -19C1.6 -16 1.6 -9 0 -3Z';
  const kiku = `<g transform="translate(200 52)">`
    + Array.from({ length: 24 }, (_, i) => `<path d="${kp}" transform="rotate(${i * 15})" fill="${C.soubi}" stroke="#8a6a12" stroke-width=".5"/>`).join('')
    + Array.from({ length: 12 }, (_, i) => `<path d="${kp}" transform="rotate(${i * 30 + 7}) scale(.6)" fill="${C.kayaLight}" stroke="#8a6a12" stroke-width=".5"/>`).join('')
    + `<circle r="3" fill="#8a6a12"/></g>`;
  return svg(
    `<defs><clipPath id="kabuki-kumo"><path d="${band}"/></clipPath></defs>`
    + `<rect width="${W}" height="${H}" fill="${C.sumi}"/>`
    + `<g opacity=".8">${flow(64, 7)}${flow(71, 7)}${flow(12, 5)}</g>`
    + `<g clip-path="url(#kabuki-kumo)">${waves}</g>`
    + `<path d="${band}" fill="none" stroke="${C.kayaLight}" stroke-width="1.5"/>`
    + botan + kiku
    + sakura(152, 62, 0.9, 12, C.gofun) + sakura(232, 20, 0.75, -20, C.sakura) + sakura(128, 30, 0.55, 30, C.sakura)
    + sakura(292, 14, 0.6, 5, C.gofun) + sakura(96, 70, 0.5, -8, C.gofun),
  );
}

/** 大詰の札の柄（定数だけでできた SVG の文字列） */
export function oozumeGara(level: OozumeLevel): string {
  return level === 'oni' ? oni() : level === 'shihan' ? shihan() : kabuki();
}
