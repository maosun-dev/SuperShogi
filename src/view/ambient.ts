// 層1：舞台ごとの動く飾り（全画面の 2D キャンバス。背景の絵の手前、文字やボタンの後ろ）。
// 歌舞伎＝舞う金の粉と斜めの光の筋、浮世絵＝流れる雲のかけらと渡る鳥、金屏風＝舞う金箔と揺れる木漏れ日。
// 「背景の動き：少なめ」では描かない。粒は MAX_PARTICLES まで。
import type { StageId } from '../app/storage';
import { makeRng } from '../ai/random';

export const MAX_PARTICLES = 120;

export type Kind = 'dust' | 'beam' | 'wisp' | 'bird' | 'leaf' | 'dapple';
export interface Particle {
  kind: Kind;
  x: number; y: number;      // 位置（px）
  vx: number; vy: number;    // 速さ（px/秒）
  size: number;
  phase: number;             // 揺れ・きらめきのずれ
  spin: number;              // 回る速さ（金箔）
}

type Rng = () => number;

function spread(n: number, kind: Kind, w: number, h: number, rng: Rng, make: (p: Particle) => void): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const p: Particle = { kind, x: rng() * w, y: rng() * h, vx: 0, vy: 0, size: 1, phase: rng() * Math.PI * 2, spin: 0 };
    make(p);
    out.push(p);
  }
  return out;
}

/** 舞台ごとの粒を作る（画面の大きさ w×h） */
export function makeParticles(stage: StageId, w: number, h: number, rng: Rng): Particle[] {
  let ps: Particle[];
  if (stage === 'kabuki') {
    ps = [
      ...spread(70, 'dust', w, h, rng, (p) => { p.vx = (rng() - 0.5) * 8; p.vy = 6 + rng() * 14; p.size = 1 + rng() * 2.2; }),
      ...spread(3, 'beam', w, h, rng, (p) => { p.x = w * (0.2 + 0.3 * rng()); p.y = 0; p.size = 60 + rng() * 50; }),
    ];
  } else if (stage === 'ukiyoe') {
    ps = [
      ...spread(9, 'wisp', w, h, rng, (p) => { p.vx = 6 + rng() * 10; p.size = 40 + rng() * 50; }),
      ...spread(3, 'bird', w, h * 0.35, rng, (p) => { p.vx = -(18 + rng() * 10); p.vy = -2; p.size = 7 + rng() * 4; }),
    ];
  } else {
    ps = [
      ...spread(28, 'leaf', w, h, rng, (p) => { p.vx = (rng() - 0.5) * 10; p.vy = 10 + rng() * 12; p.size = 3 + rng() * 4; p.spin = 1 + rng() * 2; }),
      ...spread(14, 'dapple', w, h, rng, (p) => { p.size = 18 + rng() * 34; }),
    ];
  }
  return ps.slice(0, MAX_PARTICLES);
}

/** 粒を dt 秒ぶん動かす。画面の外（余白 margin を超えた所）へ出たら反対側へ戻す */
export function stepParticles(ps: Particle[], dt: number, w: number, h: number): void {
  const margin = 120;
  for (const p of ps) {
    p.phase += dt;
    if (p.kind === 'beam' || p.kind === 'dapple') continue; // その場で揺れるだけ
    p.x += (p.vx + Math.sin(p.phase * 0.8) * (p.kind === 'leaf' ? 14 : 3)) * dt;
    p.y += p.vy * dt;
    if (p.x > w + margin) p.x = -margin;
    if (p.x < -margin) p.x = w + margin;
    if (p.y > h + margin) p.y = -margin;
    if (p.y < -margin) p.y = h + margin;
  }
}

function draw(g: CanvasRenderingContext2D, ps: Particle[], w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  for (const p of ps) {
    switch (p.kind) {
      case 'dust': {
        const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(p.phase * 3));
        g.fillStyle = `rgba(255, 214, 120, ${a.toFixed(3)})`;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'beam': {
        // 上からの斜めの光の筋（ゆっくり揺れる）
        const sway = Math.sin(p.phase * 0.25) * 30;
        const grd = g.createLinearGradient(0, 0, 0, h * 0.9);
        grd.addColorStop(0, 'rgba(255, 244, 214, .22)');
        grd.addColorStop(1, 'rgba(255, 244, 214, 0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(p.x - p.size * 0.3 + sway, 0);
        g.lineTo(p.x + p.size * 0.3 + sway, 0);
        g.lineTo(p.x + p.size * 1.6 + sway * 2, h * 0.9);
        g.lineTo(p.x - p.size * 0.6 + sway * 2, h * 0.9);
        g.closePath(); g.fill();
        break;
      }
      case 'wisp': {
        // 横に長い雲のかけら（白に墨の細い縁）
        g.fillStyle = 'rgba(252, 248, 238, .8)';
        g.strokeStyle = 'rgba(29, 26, 23, .45)';
        g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(p.x, p.y, p.size, p.size * 0.22, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        break;
      }
      case 'bird': {
        // 羽ばたく墨の「く」の字
        const f = Math.sin(p.phase * 6) * 0.5;
        g.strokeStyle = 'rgba(29, 26, 23, .8)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(p.x - p.size, p.y - p.size * f);
        g.quadraticCurveTo(p.x - p.size * 0.4, p.y - p.size * 0.3, p.x, p.y);
        g.quadraticCurveTo(p.x + p.size * 0.4, p.y - p.size * 0.3, p.x + p.size, p.y - p.size * f);
        g.stroke();
        break;
      }
      case 'leaf': {
        // 舞う金箔（回ると細くなって光る）
        const c = Math.cos(p.phase * p.spin);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.phase * 0.7);
        g.scale(Math.abs(c) + 0.1, 1);
        g.fillStyle = `rgba(230, 186, 70, ${(0.55 + 0.35 * Math.abs(c)).toFixed(3)})`;
        g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        g.restore();
        break;
      }
      case 'dapple': {
        // 障子越しの揺れる光
        const a = 0.06 + 0.06 * (0.5 + 0.5 * Math.sin(p.phase * 0.9));
        const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grd.addColorStop(0, `rgba(255, 248, 225, ${a.toFixed(3)})`);
        grd.addColorStop(1, 'rgba(255, 248, 225, 0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
        break;
      }
    }
  }
}

export interface Ambient {
  setStage(id: StageId): void;
  setMotion(m: 'full' | 'low'): void;
  destroy(): void;
}

/** 全画面のキャンバスを parent の先頭に置き、舞台ごとの粒を描き続ける */
export function mountAmbient(parent: HTMLElement, stage: StageId, motion: 'full' | 'low'): Ambient {
  const canvas = document.createElement('canvas');
  canvas.id = 'ambient';
  canvas.setAttribute('aria-hidden', 'true');
  parent.prepend(canvas);
  const g = canvas.getContext('2d');
  const rng = makeRng(7);
  let w = 0, h = 0, ps: Particle[] = [], cur = stage, raf = 0, last = 0;
  const size = (): void => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const reset = (): void => { ps = makeParticles(cur, w, h, rng); };
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // 裏に回っているときは描かない
    if (document.hidden || !g) return;
    stepParticles(ps, dt, w, h);
    draw(g, ps, w, h);
  };
  const start = (): void => {
    if (raf) return;
    canvas.hidden = false;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas.hidden = true;
  };
  const onResize = (): void => { size(); reset(); };
  addEventListener('resize', onResize);
  size();
  reset();
  if (motion === 'full') start(); else stop();
  return {
    setStage(id) { cur = id; reset(); },
    setMotion(m) { if (m === 'full') start(); else stop(); },
    destroy() { stop(); removeEventListener('resize', onResize); canvas.remove(); },
  };
}
