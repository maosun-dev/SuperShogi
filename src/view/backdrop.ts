// 層0：舞台の背景の絵。Blender で描いた 奥・中・手前 の3枚を全画面に重ね、
// 指の位置（端末が傾きを教えてくれるならその傾き）と時間で少しずつずらして奥行きを出す。
// 絵が読めないときは、色の決まりの地（--ground）だけが見える。
import type { StageId } from '../app/storage';

export type Layer = 'back' | 'mid' | 'front';
export const LAYERS: Layer[] = ['back', 'mid', 'front'];

// 層ごとのずれの大きさ（px）。奥は動かさない
const DEPTH: Record<Layer, number> = { back: 0, mid: 7, front: 16 };

export function layerUrl(base: string, stage: StageId, layer: Layer | 'thumb'): string {
  return `${base}stages/${stage}/${layer}.webp`;
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

/** 入力（-1〜1）から層のずれ（px）。手前ほど大きく、入力と逆へずらす（見ている側へ寄る感じ） */
export function parallaxShift(layer: Layer, ix: number, iy: number): { x: number; y: number } {
  const d = DEPTH[layer];
  const x = -clamp1(ix) * d, y = -clamp1(iy) * d * 0.6;
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

export interface Backdrop {
  setStage(id: StageId): void;
  setMotion(m: 'full' | 'low'): void;
  destroy(): void;
}

export function mountBackdrop(parent: HTMLElement, stage: StageId, motion: 'full' | 'low'): Backdrop {
  const box = document.createElement('div');
  box.id = 'backdrop';
  box.setAttribute('aria-hidden', 'true');
  const imgs = LAYERS.map((layer) => {
    const img = document.createElement('img');
    img.className = `bd-${layer}`;
    img.alt = '';
    img.decoding = 'async';
    // 読めなかった層は消す（地の色が見える）
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    img.addEventListener('load', () => { img.style.visibility = ''; });
    box.append(img);
    return { layer, img };
  });
  parent.prepend(box);

  const base = import.meta.env.BASE_URL;
  const setStage = (id: StageId): void => {
    for (const { layer, img } of imgs) img.src = layerUrl(base, id, layer);
  };
  setStage(stage);

  // 入力：指（マウス）の位置。動かしていないときは時間でゆっくり揺らす
  let mode = motion;
  let tx = 0, ty = 0, x = 0, y = 0, lastInput = -1e9, raf = 0;
  const onPointer = (e: PointerEvent): void => {
    tx = (e.clientX / innerWidth) * 2 - 1;
    ty = (e.clientY / innerHeight) * 2 - 1;
    lastInput = performance.now();
  };
  const onTilt = (e: DeviceOrientationEvent): void => {
    if (e.gamma === null || e.beta === null) return;
    tx = clamp1(e.gamma / 25);
    ty = clamp1((e.beta - 45) / 25);
    lastInput = performance.now();
  };
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (now - lastInput > 4000) {
      tx = Math.sin(now / 5200) * 0.6;
      ty = Math.sin(now / 7300) * 0.4;
    }
    x += (tx - x) * 0.06;
    y += (ty - y) * 0.06;
    for (const { layer, img } of imgs) {
      const s = parallaxShift(layer, x, y);
      img.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
    }
  };
  const start = (): void => {
    if (raf) return;
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('deviceorientation', onTilt);
    raf = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('pointermove', onPointer);
    removeEventListener('deviceorientation', onTilt);
    for (const { img } of imgs) img.style.transform = '';
  };
  if (mode === 'full') start();

  return {
    setStage,
    setMotion(m) {
      mode = m;
      if (m === 'full') start(); else stop();
    },
    destroy() { stop(); box.remove(); },
  };
}
