// 決着の筆文字（衡山の字を SVG で描く）。three は使わない。
// しくみ：字の輪郭を clipPath にし、その中に「筆の通り道」（brushGlyphs の strokes）を太い線で描く。
// 各画の線を stroke-dashoffset で頭から伸ばすと、伸びた所だけ字が見え、一画ずつ書いているように見える。
// 通り道は輪郭を覆いきれないので、書き終わりに輪郭そのものを重ねて塗り、欠けを残さない。
// 色：gold＝金泥に金の粉（勝）、kasure＝胡粉のかすれ（負）、usuzumi＝淡い胡粉（引分）、sumi＝墨（王手）
import { BRUSH_EM, BRUSH_GLYPHS, type BrushChar } from './brushGlyphs';

export type Ink = 'gold' | 'kasure' | 'usuzumi' | 'sumi';

const MS_PER_UNIT = 0.35; // 線の長さ1あたりの ms（740 で 260ms）
const STROKE_MIN = 120;
const STROKE_MAX = 260;
const STROKE_GAP = 60;

/** 一画ずつの間合い：各画の始まり（at）と長さ（ms）。scale は演出の長さの設定 */
export function strokeSchedule(lengths: number[], scale: number): { at: number; ms: number }[] {
  const out: { at: number; ms: number }[] = [];
  let t = 0;
  for (const len of lengths) {
    const ms = Math.min(STROKE_MAX, Math.max(STROKE_MIN, len * MS_PER_UNIT)) * scale;
    out.push({ at: t, ms });
    t += ms + STROKE_GAP * scale;
  }
  return out;
}

const NS = 'http://www.w3.org/2000/svg';
let seq = 0; // clipPath・模様の id を呼ぶたびに別にする

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** 墨の色と質感の下ごしらえ（defs に足す）。線と塗りに使う色を返す */
function inkDefs(defs: SVGDefsElement, ink: Ink, id: string): { paint: string; dust: string | null; filter: string } {
  // 筆の縁のざらつき（どの墨にも少し）
  const rough = node('filter', { id: `${id}-r`, x: '-5%', y: '-5%', width: '110%', height: '110%' });
  rough.append(
    node('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.035', numOctaves: 2, seed: 7, result: 'n' }),
    node('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 14, xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' }),
  );
  if (ink === 'kasure') {
    // 横に流れる筋のノイズで紙の白を抜く
    rough.append(
      node('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.003 0.04', numOctaves: 2, seed: 3, result: 'k' }),
      node('feColorMatrix', { in: 'k', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 5.2', result: 'ka' }),
      node('feComposite', { in: 'd', in2: 'ka', operator: 'in' }),
    );
  }
  defs.append(rough);
  let dust: string | null = null;
  if (ink === 'gold') {
    // 金の粉：小さな点を散らした模様
    const p = node('pattern', { id: `${id}-g`, width: 64, height: 64, patternUnits: 'userSpaceOnUse' });
    for (let i = 0; i < 6; i++) {
      p.append(node('circle', {
        cx: (Math.random() * 64).toFixed(1), cy: (Math.random() * 64).toFixed(1), r: (2 + Math.random() * 4).toFixed(1),
        fill: 'var(--brush-gold-dust, #fff1bf)', opacity: (0.7 + Math.random() * 0.3).toFixed(2),
      }));
    }
    defs.append(p);
    dust = `url(#${id}-g)`;
  }
  // 暗転した舞台で読めるよう、王手（朱のしぶきの上）だけ墨、ほかは明るい色（金泥・胡粉）
  const paint = {
    sumi: 'var(--brush-sumi, #17130f)',
    gold: 'var(--brush-gold, #d9a52e)',
    kasure: 'var(--brush-gofun, #e4e6ec)',
    usuzumi: 'var(--brush-usuzumi, #b9b2a6)',
  }[ink];
  return { paint, dust, filter: `url(#${id}-r)` };
}

interface Built {
  el: SVGSVGElement;
  strokes: { line: SVGPathElement[]; len: number }[]; // 書き順どおり（字をまたいで通し）
  fills: SVGPathElement[];                             // 字ごとの輪郭の塗り（書き終わりに重ねる）
}

function build(text: string, ink: Ink): Built {
  const chars = [...text].filter((c): c is BrushChar => c in BRUSH_GLYPHS);
  const id = `brush${++seq}`;
  const w = BRUSH_EM * Math.max(1, chars.length);
  const el = node('svg', { viewBox: `0 0 ${w} ${BRUSH_EM}`, class: `brush ink-${ink}`, 'aria-hidden': 'true' });
  const defs = node('defs');
  el.append(defs);
  const { paint, dust, filter } = inkDefs(defs, ink, id);
  const body = node('g', { filter });
  el.append(body);
  const strokes: Built['strokes'] = [];
  const fills: SVGPathElement[] = [];
  chars.forEach((c, i) => {
    const g = BRUSH_GLYPHS[c];
    const cp = node('clipPath', { id: `${id}-c${i}` });
    cp.append(node('path', { d: g.d }));
    defs.append(cp);
    const at = node('g', { transform: `translate(${i * BRUSH_EM} 0)` });
    const clip = node('g', { 'clip-path': `url(#${id}-c${i})` });
    for (const s of g.strokes) {
      const mk = (stroke: string): SVGPathElement => node('path', {
        d: s.d, fill: 'none', stroke, 'stroke-width': s.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      });
      const line = [mk(paint)];
      if (dust) line.push(mk(dust));
      clip.append(...line);
      strokes.push({ line, len: 0 });
    }
    const fill = node('path', { d: g.d, fill: paint });
    fill.style.opacity = '0';
    at.append(clip, fill);
    if (dust) {
      const df = node('path', { d: g.d, fill: dust });
      df.style.opacity = '0';
      at.append(df);
      fills.push(df);
    }
    fills.push(fill);
    body.append(at);
  });
  return { el, strokes, fills };
}

function showAll(b: Built): void {
  for (const s of b.strokes) for (const p of s.line) p.style.strokeDashoffset = '0';
  for (const f of b.fills) f.style.opacity = '1';
}

export interface BrushWord {
  el: SVGSVGElement;
  /** 一画ずつ書く。run は「ms かけて fn(0→1) を呼ぶ」（ctx.tweenRaw を渡す）。scale は長さの設定。onStroke は画の書き始めごと */
  write(run: (ms: number, fn: (t: number) => void) => Promise<void>, scale: number, onStroke?: () => void): Promise<void>;
  /** すぐ書き終わりの姿にする（タップで飛ばす・動きを減らす設定） */
  finish(): void;
}

/**
 * 筆文字を作る（まだ何も見えない）。el を画面に置いてから write を呼ぶ（線の長さは置いたあとでないと測れない）。
 * text の字は BRUSH_GLYPHS にあるものだけ使う
 */
export function brushWord(text: string, ink: Ink): BrushWord {
  const b = build(text, ink);
  let done = false;
  for (const s of b.strokes) for (const p of s.line) p.style.strokeDashoffset = '1e5';
  return {
    el: b.el,
    async write(run, scale, onStroke) {
      for (const s of b.strokes) {
        s.len = s.line[0].getTotalLength() + 4;
        for (const p of s.line) { p.style.strokeDasharray = `${s.len} ${s.len}`; p.style.strokeDashoffset = String(s.len); }
      }
      const plan = strokeSchedule(b.strokes.map((s) => s.len), scale);
      let t = 0;
      for (let i = 0; i < b.strokes.length && !done; i++) {
        const { at, ms } = plan[i];
        if (at > t) await run(at - t, () => {});
        if (done) break;
        onStroke?.();
        const s = b.strokes[i];
        await run(ms, (k) => {
          if (done) return;
          const off = String(s.len * (1 - k));
          for (const p of s.line) p.style.strokeDashoffset = off;
        });
        t = at + ms;
      }
      // 書き終わり：輪郭そのものを重ねて、通り道の塗り残しを消す
      if (!done) {
        await run(140 * scale, (k) => { if (!done) for (const f of b.fills) f.style.opacity = String(k); });
      }
      this.finish();
    },
    finish() {
      done = true;
      showAll(b);
    },
  };
}

/** 書き終わりの姿の筆文字（結果画面用） */
export function brushStill(text: string, ink: Ink): SVGSVGElement {
  const b = build(text, ink);
  showAll(b);
  return b.el;
}
