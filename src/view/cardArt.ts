// 12枚のカードの絵（自作の SVG）と札の HTML。
// 絵はすべて viewBox="0 0 46 62" の中身。描き方は「墨の太い線＋種類の色1つ＋金箔をひと差し」。
// 色は palette.ts の文字列形だけを使う（ここに色の値を直に書かない）。
// 入れる文字はすべてこのファイルとカード定義の定数だけ（利用者の入力は入らない）。
import type { CardId } from '../rules/types';
import type { CardKind } from '../cards/types';
import { CARDS } from '../cards';
import { PALS } from './palette';

const S = PALS.sumi;
const M = PALS.mahou;
const W = PALS.wana;
const G = PALS.soubi;
const P = PALS.gofun;
const K = PALS.kayaLight; // 駒の木の色

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** 五角形の駒（先が上）。cx は中心、y は先の高さ、w・h は幅と高さ */
function piece(cx: number, y: number, w: number, h: number, sw = 1.6): string {
  const pts = [
    [cx - w / 2, y + h], [cx + w / 2, y + h], [cx + w * 0.4, y + h * 0.32], [cx, y], [cx - w * 0.4, y + h * 0.32],
  ].map(([x, yy]) => `${r1(x)},${r1(yy)}`).join(' ');
  return `<polygon points="${pts}" fill="${K}" stroke="${S}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** 矢じり（三角）。(ex,ey) が先、(dx,dy) が向き */
function arrowHead(ex: number, ey: number, dx: number, dy: number, fill: string, len = 6, wid = 4): string {
  const l = Math.hypot(dx, dy);
  const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const bx = ex - ux * len, by = ey - uy * len;
  return `<polygon points="${r1(ex)},${r1(ey)} ${r1(bx + nx * wid)},${r1(by + ny * wid)} ${r1(bx - nx * wid)},${r1(by - ny * wid)}" fill="${fill}"/>`;
}

/** 六方の霜の結晶。中心 (cx,cy)、腕の長さ r */
function crystal(cx: number, cy: number, r: number, color: string, sw: number): string {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = (-90 + 60 * k) * Math.PI / 180;
    const ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r;
    d += `M${r1(cx)} ${r1(cy)} L${r1(ex)} ${r1(ey)} `;
    // 腕の途中から出る小枝（V の字）
    const bx = cx + Math.cos(a) * r * 0.58, by = cy + Math.sin(a) * r * 0.58;
    for (const s of [-1, 1]) {
      const b = a + s * 0.85;
      d += `M${r1(bx)} ${r1(by)} L${r1(bx + Math.cos(b) * r * 0.36)} ${r1(by + Math.sin(b) * r * 0.36)} `;
    }
  }
  return `<path d="${d.trim()}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
}

/** 六角形（先が上）の頂点 */
function hexPts(cx: number, cy: number, r: number): string {
  const out: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (-90 + 60 * k) * Math.PI / 180;
    out.push(`${r1(cx + Math.cos(a) * r)},${r1(cy + Math.sin(a) * r)}`);
  }
  return out.join(' ');
}

/** 鎧の板1枚（下にふくらむ帯）。y は上の端、w は上の幅、grow は下の端で広がる分 */
function plate(y: number, w: number, grow: number, fill: string): string {
  const x1 = 23 - w / 2, x2 = 23 + w / 2, h = 8;
  return `<path d="M${r1(x1)} ${y} Q23 ${y + 3} ${r1(x2)} ${y} L${r1(x2 + grow)} ${y + h} Q23 ${y + h + 3.5} ${r1(x1 - grow)} ${y + h}Z" fill="${fill}" stroke="${P}" stroke-width="1"/>`;
}

/** 仮の絵：名前の1文字目を大きく書く（計画6で描き直す） */
function glyph(ch: string): string {
  return `<text x="23" y="42" text-anchor="middle" font-size="30" fill="${P}" font-family="serif">${ch}</text>`;
}

export const CARD_ART: Record<CardId, string> = {
  kakuotoshi: glyph('格'),
  shoryu: glyph('昇'),
  aiuchi: glyph('相'),
  migawari: glyph('身'),
  tsuranuki: glyph('貫'),
  omori: glyph('重'),
  // ---- 試作から移したもの（色だけパレットに置き換え） ----
  // 落雷：墨の雲から藍の稲妻
  rakurai: `<circle cx="14" cy="12" r="9" fill="${S}"/><circle cx="26" cy="9" r="10" fill="${S}"/><circle cx="35" cy="15" r="7" fill="${S}"/>
    <path d="M24 18 L15 36 L23 36 L17 58 L34 30 L25 30 L31 18Z" fill="${M}" stroke="${S}" stroke-width="1.5"/>`,
  // 鏡の結界：紅の輪に金の鏡
  kagami: `<circle cx="23" cy="30" r="17" fill="none" stroke="${W}" stroke-width="3"/><circle cx="23" cy="30" r="12" fill="${G}"/>
    <path d="M15 26 L27 18 M16 33 L31 23" stroke="${P}" stroke-width="2.5" stroke-linecap="round"/><path d="M23 47 L23 58 M15 58 L31 58" stroke="${S}" stroke-width="3"/>`,
  // 天馬の蹄：金の蹄鉄に墨の翼
  tenma: `<path d="M10 52 Q10 22 23 22 Q36 22 36 52 L29 52 Q29 31 23 31 Q17 31 17 52Z" fill="${G}" stroke="${S}" stroke-width="1.5"/>
    <path d="M4 20 Q12 6 20 14 M42 20 Q34 6 26 14 M6 28 Q12 18 18 22 M40 28 Q34 18 28 22" stroke="${S}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  // 押し返しの風：藍と墨の渦を巻く風
  oshikaeshi: `<path d="M6 18 Q30 8 32 20 Q33 28 24 26" stroke="${M}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M4 34 Q34 26 38 38 Q39 46 30 44" stroke="${S}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M10 50 Q28 44 30 52" stroke="${M}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

  // ---- 新しく描いたもの ----
  // 入れ替えの術：下の2つの駒から、互いの頭上へ交差する2本の弧の矢
  irekae: `${piece(10, 40, 15, 18)}${piece(36, 40, 15, 18)}
    <path d="M10 37 Q14 4 33 31" stroke="${S}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${arrowHead(35.5, 35, 19, 27, S)}
    <path d="M36 37 Q32 4 13 31" stroke="${P}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <path d="M36 37 Q32 4 13 31" stroke="${M}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${arrowHead(10.5, 35, -19, 27, M)}
    <circle cx="23" cy="20.2" r="2.4" fill="${G}" stroke="${S}" stroke-width="1"/>`,
  // 凍てつく盤：盤の格子に六方の霜の結晶がかかる
  itetsuku: `<rect x="16" y="22" width="12" height="12" fill="${M}" opacity=".22"/>
    <path d="M4 22 L40 22 M4 34 L40 34 M4 46 L40 46 M16 10 L16 58 M28 10 L28 58" stroke="${S}" stroke-width="1.6"/>
    <rect x="4" y="10" width="36" height="48" fill="none" stroke="${S}" stroke-width="2.6"/>
    ${crystal(22, 28, 16, P, 6)}${crystal(22, 28, 16, M, 3)}
    <circle cx="22" cy="28" r="2.6" fill="${G}" stroke="${S}" stroke-width="1"/>`,
  // 呼び戻し：右から伸びる墨の袖が手招きし、五角形の駒が袖へ戻る
  yobimodoshi: `<path d="M46 4 L46 32 Q36 36 27 30 Q24 19 26 8 Q36 2 46 4Z" fill="${S}"/>
    <path d="M26 8 Q23 19 27 30" stroke="${M}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="38" cy="17" r="3.2" fill="${G}"/>
    <path d="M25 13 Q16 10 12 14 Q9 18 12 22 Q14 24 16 21 Q15 18 18 17.5 L25 24Z" fill="${P}" stroke="${S}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M7 12 Q4 17 7 22 M3 10 Q-1 17 3 24" stroke="${S}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${piece(13, 38, 16, 20)}
    <path d="M23 50 Q34 50 33 37" stroke="${M}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    ${arrowHead(33, 33, 0, -1, M, 5, 3.6)}`,
  // 落とし穴：割れた地面と、口を開けた黒い穴（縁は紅、落ちる金の小石）
  otoshiana: `<path d="M1 40 L5 40 M42 41 L45 41 M2 54 L11 54 M17 58 L29 58 M35 54 L44 54" stroke="${S}" stroke-width="1.8" stroke-linecap="round"/>
    <polygon points="5,40 9,35 14,36 18,32 25,34 30,31 35,35 41,35 42,41 36,46 29,49 20,48 12,47 7,44" fill="${S}"/>
    <path d="M5 40 L9 35 L14 36 L18 32 L25 34 L30 31 L35 35 L41 35 L42 41" stroke="${W}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M18 32 L15 27 L16 23 M30 31 L33 26 L31 22 M7 44 L3 47" stroke="${S}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="22,16 26.5,19 24.5,24 20,20.5" fill="${G}" stroke="${S}" stroke-width="1"/>
    <path d="M21 8 L21 13 M25.5 10 L25.5 14" stroke="${S}" stroke-width="1.4" stroke-linecap="round"/>`,
  // 成り封じ：駒に「封」の字の朱印が押される（成りの金の矢は止められる）
  narifuuji: `${piece(19, 4, 30, 40, 2)}
    <path d="M38 22 L38 6" stroke="${G}" stroke-width="3" stroke-linecap="round"/>${arrowHead(38, 2, 0, -1, G, 5, 4)}
    <path d="M33 9 L43 17" stroke="${S}" stroke-width="2.4" stroke-linecap="round"/>
    <g transform="rotate(-8 30 45)"><rect x="18" y="33" width="24" height="24" rx="2" fill="${W}"/>
    <rect x="20.5" y="35.5" width="19" height="19" fill="none" stroke="${P}" stroke-width="1"/>
    <text x="30" y="51.5" text-anchor="middle" font-size="16" font-weight="800" font-family="'Shippori Mincho B1', serif" fill="${P}">封</text></g>`,
  // 鋼の鎧：肩紐と、重なる鉄の胴の板（いちばん上の胸板が金）
  hagane: `<path d="M14 16 L11 5 M32 16 L35 5" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
    <path d="M11 17 Q23 9 35 17" stroke="${S}" stroke-width="2" fill="none"/>
    ${plate(46, 34, 2, S)}${plate(39, 31, 1.6, S)}${plate(32, 28, 1.6, S)}${plate(25, 25, 1.6, S)}${plate(17, 23, 1.2, G)}
    <path d="M17 29 L17 33 M29 29 L29 33 M16 36 L16 40 M30 36 L30 40 M15 43 L15 47 M31 43 L31 47 M14 50 L14 54 M32 50 L32 54" stroke="${G}" stroke-width="1.6" stroke-linecap="round"/>`,
  // 王の盾：金の六角の盾に、墨の「王」
  tate: `<polygon points="${hexPts(23, 32, 21)}" fill="${G}" stroke="${S}" stroke-width="2.4" stroke-linejoin="round"/>
    <polygon points="${hexPts(23, 32, 15.5)}" fill="none" stroke="${S}" stroke-width="1"/>
    <path d="M14 23 L32 23 M15.5 32 L30.5 32 M12 41.5 L34 41.5 M23 23 L23 41.5" stroke="${S}" stroke-width="3.6" stroke-linecap="square"/>
    <circle cx="23" cy="14.5" r="1.4" fill="${S}"/><circle cx="23" cy="49.5" r="1.4" fill="${S}"/>`,
  // 韋駄天：前へ傾いて風を切る金の草鞋と、後ろへ流れる2本の速さの線
  idaten: `<path d="M4.6 36.6 L13 28.2 M17.4 49.4 L25.8 41 M8 46 L13 41" stroke="${S}" stroke-width="2.8" stroke-linecap="round"/>
    <g transform="rotate(45 30 24)">
    <rect x="23" y="9" width="14" height="30" rx="7" fill="${G}" stroke="${S}" stroke-width="2"/>
    <path d="M23.5 18 L36.5 18 M23 24 L37 24 M23 30 L37 30 M24 35 L36 35" stroke="${S}" stroke-width="1.1"/>
    <path d="M30 12.5 L24.5 24 M30 12.5 L35.5 24" stroke="${S}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="24.5" cy="24" r="1.7" fill="${S}"/><circle cx="35.5" cy="24" r="1.7" fill="${S}"/></g>
    <path d="M33 4 Q43 3 44.5 13" stroke="${S}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
};

export const KIND_MARK: Record<CardKind, { mark: '魔' | '罠' | '装'; label: '魔法' | '罠' | '装備'; color: 'mahou' | 'wana' | 'soubi' }> = {
  magic: { mark: '魔', label: '魔法', color: 'mahou' },
  trap: { mark: '罠', label: '罠', color: 'wana' },
  equip: { mark: '装', label: '装備', color: 'soubi' },
};

const KANSUJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 札の HTML（試作の .card と同じ組み立て）。size: hand 74×112 / small 36×54 / large 180×272 */
export function cardHtml(id: CardId, opts: { size?: 'hand' | 'small' | 'large'; count?: number } = {}): string {
  const c = CARDS[id];
  const k = KIND_MARK[c.kind];
  const size = opts.size ?? 'hand';
  const label = `${c.name}（${k.label}・コスト${c.cost}）`;
  const name = size === 'small' ? '' : `<span class="name">${c.name}</span>`;
  const count = opts.count && opts.count > 0 ? `<span class="count">${KANSUJI[opts.count] ?? opts.count}</span>` : '';
  return `<div class="card ${k.color} ${size}" data-card="${id}" aria-label="${label}">`
    + `<span class="cost">${c.cost}</span>${name}`
    + `<svg viewBox="0 0 46 62" aria-hidden="true">${CARD_ART[id]}</svg>`
    + `<span class="kind">${k.mark}</span>${count}</div>`;
}
