// アプリのアイコン（1024 四方の SVG）。A 案の仕上げ：
// 夜の藍の地に、紅の隈取の一筆が右上から左下へ走り、その前に榧の駒が少し左へ傾いて立つ。駒には墨の「超」。
// 色は src/view/palette.ts の名前付きの色だけを使う。
import { PALS as P } from '../../src/view/palette.ts';

const S = 1024;

/** 小数を短く書く（SVG を小さく・読みやすく） */
const f = (n) => Math.round(n * 10) / 10;

/** 決まった種から同じ並びの乱数を出す（何度作っても同じ絵になるように） */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 3次ベジェ曲線の点と接線 */
function bezier(p, t) {
  const u = 1 - t;
  const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
  const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
  const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
  const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, nx: -dy / len, ny: dx / len, tx: dx / len, ty: dy / len };
}

const pts = (list) => list.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L');

// ---- 背の隈取（紅の一筆） ----
// 筆の通り道（右上の打ち込みから左下の払いへ。途中で少しうねる）
const KUMA_PATH = [
  [868, 104],
  [720, 260],
  [520, 470],
  [34, 846],
];

/** 筆の太さ：打ち込みで太く膨らみ、払いへ向かって細く消える。少しだけ揺れる */
function kumaWidth(t) {
  const head = Math.min(1, t / 0.08);
  const swell = 0.82 + 0.18 * Math.sin((Math.PI / 2) * head);
  const taper = Math.pow(1 - t, 0.62);
  const wobble = 1 + 0.06 * Math.sin(t * 19) + 0.03 * Math.sin(t * 47);
  return 104 * swell * taper * wobble + 1.5 * (1 - t);
}

/** 一筆の輪郭（片側を少しずらして、筆の腹と背の違いを出す） */
function kumaOutline(dx = 0, dy = 0, grow = 1) {
  const N = 140;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const b = bezier(KUMA_PATH, t);
    const w = kumaWidth(t) * grow;
    // 筆の腹（右下側）を少し厚く
    left.push([b.x + b.nx * w * 0.92 + dx, b.y + b.ny * w * 0.92 + dy]);
    right.push([b.x - b.nx * w * 1.08 + dx, b.y - b.ny * w * 1.08 + dy]);
  }
  // 打ち込みの頭は丸く（筆を置いたところ）
  const b0 = bezier(KUMA_PATH, 0);
  const w0 = kumaWidth(0) * grow;
  const cap = [];
  for (let k = 11; k > 0; k--) {
    const a = Math.PI * (k / 12);
    // 頭は筆の進む向きの逆へふくらむ
    const ox = Math.cos(a) * b0.nx * w0 - Math.sin(a) * b0.tx * w0 * 0.7;
    const oy = Math.cos(a) * b0.ny * w0 - Math.sin(a) * b0.ty * w0 * 0.7;
    cap.push([b0.x + ox + dx, b0.y + oy + dy]);
  }
  return `M${pts([...left, ...right.reverse(), ...cap])}Z`;
}

/** かすれ：払いに近いほど、筆の毛が割れたすき間を増やす（マスクの黒い筋） */
function kumaDryStreaks() {
  const rnd = seeded(7);
  const lines = [];
  for (let i = 0; i < 34; i++) {
    const lane = rnd() * 2 - 1; // 筆の幅の中のどの位置か（-1〜1）
    const t0 = 0.5 + rnd() * 0.42; // かすれの始まり（払いに近いほど多い）
    const width = 2.5 + rnd() * 6;
    const seg = [];
    for (let t = t0; t <= 1.001; t += 0.01) {
      const b = bezier(KUMA_PATH, Math.min(t, 1));
      const w = kumaWidth(Math.min(t, 1));
      seg.push([b.x + b.nx * w * lane * 0.95, b.y + b.ny * w * lane * 0.95]);
    }
    lines.push(`<path d="M${pts(seg)}" stroke-width="${f(width)}"/>`);
  }
  // 打ち込み側にもわずかな毛筋（ベタ塗りに見せない）
  for (let i = 0; i < 4; i++) {
    const lane = rnd() * 1.6 - 0.8;
    const t0 = 0.05 + rnd() * 0.15;
    const t1 = t0 + 0.06 + rnd() * 0.1;
    const seg = [];
    for (let t = t0; t <= t1; t += 0.01) {
      const b = bezier(KUMA_PATH, t);
      const w = kumaWidth(t);
      seg.push([b.x + b.nx * w * lane, b.y + b.ny * w * lane]);
    }
    lines.push(`<path d="M${pts(seg)}" stroke-width="${f(1.5 + rnd() * 2)}"/>`);
  }
  return lines.join('');
}

/** 打ち込みの飛び散り（墨ならぬ紅のしずく） */
function kumaSplash() {
  const drops = [
    [950, 66, 12],
    [978, 112, 6],
    [912, 40, 7],
    [992, 58, 4],
    [948, 150, 4],
  ];
  return drops.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
}

// ---- 駒 ----
// 駒の五角形（中心が原点。下の辺がいちばん広く、肩から屋根へすぼまる）
const PIECE = [
  [-262, 330],
  [262, 330],
  [222, -178],
  [0, -330],
  [-222, -178],
];
const PIECE_CX = 498;
const PIECE_CY = 556;
const PIECE_TILT = -7;
const THICK = [22, 30]; // 厚み（右下へ見える側面の向きと長さ）
const BEVEL = 20; // 面取りの幅

/** 多角形を内側へ d だけ縮める（各辺を平行にずらして隣と交わる点を取る） */
function inset(poly, d) {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // 内向きの法線（頂点は画面で左下→右下→右肩→頂→左肩の順）
    const nx = (b[1] - a[1]) / len;
    const ny = -(b[0] - a[0]) / len;
    return { a: [a[0] + nx * d, a[1] + ny * d], b: [b[0] + nx * d, b[1] + ny * d] };
  });
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n];
    return intersect(m.a, m.b, l.a, l.b);
  });
}

function intersect(p1, p2, p3, p4) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const a = p1[0] * p2[1] - p1[1] * p2[0];
  const b = p3[0] * p4[1] - p3[1] * p4[0];
  return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
}

/** 側面（厚み）：右下を向いた辺だけ、辺とずらした辺の間を塗る */
function pieceSides() {
  const n = PIECE.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = PIECE[i];
    const b = PIECE[(i + 1) % n];
    // 外向きの法線
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    if (nx * THICK[0] + ny * THICK[1] <= 0) continue;
    const quad = [a, b, [b[0] + THICK[0], b[1] + THICK[1]], [a[0] + THICK[0], a[1] + THICK[1]]];
    // 下の辺は影で暗く、右の辺は少し明るい
    const fill = ny > Math.abs(nx) ? 'url(#sideBottom)' : 'url(#sideRight)';
    out.push(`<path d="M${pts(quad)}Z" fill="${fill}"/>`);
  }
  return out.join('');
}

/** 駒の外形（上の面と、右下へずらした面を合わせた輪郭） */
function silhouette() {
  // 左下の角から：上の面の下の辺の左端 → ずらした面の下の辺 → ずらした右の辺 → 右肩 → 頂 → 左肩
  const t = (p) => [p[0] + THICK[0], p[1] + THICK[1]];
  const [bl, br, rs, top, ls] = PIECE;
  return `M${pts([bl, t(bl), t(br), t(rs), rs, top, ls])}Z`;
}

/** 面取り：外周と内側の間を辺ごとに塗り分ける（光の来る左上は明るく、右下は暗く） */
function pieceBevel(inner) {
  const n = PIECE.length;
  const out = [];
  // 光は左上から（-0.6, -0.8）
  const lx = -0.6;
  const ly = -0.8;
  for (let i = 0; i < n; i++) {
    const a = PIECE[i];
    const b = PIECE[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len; // 外向きの法線
    const ny = (b[0] - a[0]) / len;
    const lit = nx * lx + ny * ly; // 1 で光の正面、-1 で影
    const quad = [a, b, inner[(i + 1) % n], inner[i]];
    let fill;
    let op;
    if (lit > 0.3) {
      fill = P.kayaLight;
      op = 0.95;
    } else if (lit > -0.2) {
      fill = P.kayaLight;
      op = 0.45;
    } else {
      fill = P.kayaSide;
      op = 1;
    }
    out.push(`<path d="M${pts(quad)}Z" fill="${fill}" fill-opacity="${op}"/>`);
  }
  return out.join('');
}

/** 木目：上から下へ流れる細い筋を数本（少しうねり、ところどころ濃い） */
function pieceGrain() {
  const rnd = seeded(31);
  const out = [];
  for (let i = 0; i < 15; i++) {
    const x0 = -250 + i * 35 + (rnd() - 0.5) * 16;
    const amp = 6 + rnd() * 10;
    const freq = 0.006 + rnd() * 0.006;
    const phase = rnd() * Math.PI * 2;
    const seg = [];
    for (let y = -360; y <= 360; y += 12) {
      // 中ほどで節に寄るように少し曲げる
      const bend = 18 * Math.exp(-((y - 60) ** 2) / 26000) * Math.sign(x0 - 30);
      seg.push([x0 + Math.sin(y * freq + phase) * amp + bend, y]);
    }
    const w = 1.6 + rnd() * 2.6;
    const op = 0.12 + rnd() * 0.16;
    out.push(`<path d="M${pts(seg)}" stroke-width="${f(w)}" stroke-opacity="${f(op * 100) / 100}"/>`);
  }
  return out.join('');
}

/**
 * アイコンの SVG（1024×1024）。
 * @param {string} fontFamily 「超」を書く筆文字の字体名（Yuji Boku）
 */
export function iconSvg(fontFamily) {
  const inner = inset(PIECE, BEVEL);
  const face = `M${pts(PIECE)}Z`;
  const innerFace = `M${pts(inner)}Z`;
  const ff = `'${fontFamily}'`;
  // 字の置き場所（駒の中で少し下寄り。屋根の三角に頭が入りすぎないように）
  const glyph = (dx, dy, fill, extra = '') =>
    `<text x="${dx}" y="${168 + dy}" text-anchor="middle" font-family="${ff}" font-size="446" fill="${fill}" ${extra}>超</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
  <radialGradient id="ground" cx="50%" cy="44%" r="72%">
    <stop offset="0" stop-color="${P.yoruLight}"/>
    <stop offset="0.58" stop-color="${P.yoru}"/>
    <stop offset="1" stop-color="${P.yoruDeep}"/>
  </radialGradient>
  <linearGradient id="kayaFace" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="${P.kayaLight}"/>
    <stop offset="0.5" stop-color="${P.kaya}"/>
    <stop offset="1" stop-color="${P.kayaSide}"/>
  </linearGradient>
  <linearGradient id="sideRight" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.kayaSide}"/>
    <stop offset="1" stop-color="${P.kayaLeg}"/>
  </linearGradient>
  <linearGradient id="sideBottom" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${P.kayaLeg}"/>
    <stop offset="1" stop-color="${P.kayaGrainDeep}"/>
  </linearGradient>
  <mask id="dry" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">
    <rect width="${S}" height="${S}" fill="${P.hakkou}"/>
    <g fill="none" stroke="${P.sumiHole}" stroke-linecap="round">${kumaDryStreaks()}</g>
  </mask>
  <clipPath id="faceClip"><path d="${innerFace}"/></clipPath>
  <filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}"><feGaussianBlur stdDeviation="26"/></filter>
</defs>
<rect width="${S}" height="${S}" fill="url(#ground)"/>
<g mask="url(#dry)">
  <path d="${kumaOutline(10, 12, 1.0)}" fill="${P.wanaDeep}"/>
  <path d="${kumaOutline()}" fill="${P.wana}"/>
  <g fill="${P.wana}">${kumaSplash()}</g>
</g>
<g filter="url(#soft)" opacity="0.8">
  <path d="${face}" fill="${P.yoruNight}" transform="translate(${PIECE_CX + 44} ${PIECE_CY + 56}) rotate(${PIECE_TILT})"/>
</g>
<g transform="translate(${PIECE_CX} ${PIECE_CY}) rotate(${PIECE_TILT})">
  ${pieceSides()}
  <path d="${silhouette()}" fill="none" stroke="${P.sumi}" stroke-width="7" stroke-linejoin="round"/>
  <path d="${face}" fill="url(#kayaFace)"/>
  <g clip-path="url(#faceClip)" fill="none" stroke="${P.kayaGrain}" stroke-linecap="round">${pieceGrain()}</g>
  ${pieceBevel(inner)}
  <path d="${innerFace}" fill="none" stroke="${P.kayaLight}" stroke-opacity="0.55" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="${face}" fill="none" stroke="${P.sumi}" stroke-width="7" stroke-linejoin="round"/>
  ${glyph(4, 5, P.kayaLight, 'fill-opacity="0.8"')}
  ${glyph(0, 0, P.sumi, `stroke="${P.sumi}" stroke-width="7" stroke-linejoin="round"`)}
</g>
</svg>`;
}
