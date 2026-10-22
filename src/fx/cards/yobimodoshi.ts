// 呼び戻し（コスト2・約3秒）
// 前振り：相手の駒台がぼうっと光る
// 見せ場：上から釣り糸が伸びて相手の持ち駒を引っかけ、ひょいっと釣り上げて自分の駒台へポン
// 余韻：糸が巻き上がって消える
// 駒台は HTML なので、糸と駒札は重ね板（overlay）に描く。動きは ctx.tween で毎フレーム位置を書く
import { PAL, PALS, rgba } from '../../view/palette';
import { HAND_LABEL } from '../../view/hud';
import { easeInOut, easeOut, localRect, overlay, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { effect, type CardFx, type MagicCue } from './types';

interface Plan {
  src: HTMLElement | null;       // 釣られる駒札（相手の駒台）
  fromBox: HTMLElement;
  x0: number; y0: number;        // 釣られる駒札の左上（root の中）
  x2: number; y2: number;        // 行き先（受け取る側の駒台）
  label: string;
  flipFrom: number; flipTo: number; // 駒札の向き（相手の駒札は先が下）
}

function plan(ctx: FxCtx, cue: MagicCue): Plan | null {
  const e = effect(cue, 'handTransferred');
  if (!e) return null;
  const root = ctx.hud.root;
  const fromBox = root.querySelector<HTMLElement>(e.from === ctx.me ? '.komadai.me' : '.komadai.foe');
  const toBox = root.querySelector<HTMLElement>(e.to === ctx.me ? '.komadai.me' : '.komadai.foe');
  if (!fromBox || !toBox) return null;
  const label = HAND_LABEL[e.kind];
  const src = [...fromBox.querySelectorAll<HTMLElement>('.koma')].find((k) => k.querySelector('.face')?.textContent === label) ?? null;
  const sr = localRect(ctx, src ?? fromBox);
  const toks = toBox.querySelectorAll<HTMLElement>('.koma');
  const last = toks[toks.length - 1];
  const tr = localRect(ctx, toBox);
  const x2 = last ? localRect(ctx, last).x + localRect(ctx, last).w + 6 : tr.x + 2;
  return {
    src, fromBox, label,
    x0: sr.x, y0: sr.y + (src ? 0 : 4),
    x2, y2: tr.y + 2,
    flipFrom: e.from === ctx.me ? 0 : 180,
    flipTo: e.to === ctx.me ? 0 : 180,
  };
}

/** 重ね板に置く駒札（駒台の駒札と同じ形） */
function komaEl(label: string): HTMLElement {
  const k = document.createElement('span');
  k.className = 'koma';
  k.style.left = '0'; k.style.top = '0';
  const f = document.createElement('span');
  f.className = 'face';
  f.textContent = label;
  k.append(f);
  return k;
}

/** 駒台のまわりに灯る淡い光 */
function glowEl(r: { x: number; y: number; w: number; h: number }, color: number): HTMLElement {
  const g = document.createElement('div');
  Object.assign(g.style, {
    left: `${r.x - 10}px`, top: `${r.y - 8}px`, width: `${r.w + 20}px`, height: `${r.h + 16}px`,
    borderRadius: '10px',
    border: `2px solid ${rgba(color, 0.9)}`,
    boxShadow: `0 0 14px 3px ${rgba(color, 0.75)}, inset 0 0 12px ${rgba(color, 0.55)}`,
    background: rgba(color, 0.12),
    opacity: '0',
  });
  return g;
}

const KOMA_W = 29; // 駒札の幅のおよそ（重ね板の駒札の中心を糸の先に合わせるため）

const live = new WeakMap<MagicCue, HTMLElement[]>();

function keep(cue: MagicCue, ...els: HTMLElement[]): void {
  live.set(cue, [...(live.get(cue) ?? []), ...els]);
}

export const yobimodoshi: CardFx<MagicCue> = {
  async pre(ctx, cue) {
    const p = plan(ctx, cue);
    if (!p) return;
    const g = glowEl(localRect(ctx, p.fromBox), PAL.mahou);
    overlay(ctx).append(g);
    keep(cue, g);
    getSound().play('chime', { gain: 0.35 });
    await ctx.tween(700, (t) => { g.style.opacity = String(0.4 + 0.6 * Math.sin(Math.PI * t * 1.5) ** 2); });
  },
  async main(ctx, cue) {
    const p = plan(ctx, cue);
    if (!p) return;
    const fly = overlay(ctx);
    const box = ctx.hud.root.getBoundingClientRect();
    // 糸：画面の上の外から下りる細い線。先に小さな金の針
    const line = document.createElement('div');
    Object.assign(line.style, { left: '0', top: '0', width: '1.5px', height: '0', background: PALS.sumi, transformOrigin: 'top center', boxShadow: `0 0 2px ${rgba(PAL.gofun, 0.9)}` });
    const hook = document.createElement('div');
    Object.assign(hook.style, { left: '0', top: '0', width: '10px', height: '12px', borderRight: `2px solid ${PALS.soubiLight}`, borderBottom: `2px solid ${PALS.soubiLight}`, borderRadius: '0 0 8px 0' });
    const koma = komaEl(p.label);
    fly.append(line, hook);
    keep(cue, line, hook, koma);
    const cx0 = p.x0 + KOMA_W / 2;
    const cx2 = p.x2 + KOMA_W / 2;
    const topY = -20;
    // 糸の先（tip）の位置に、糸と針を合わせる。角度 sway（度）で振れる
    const place = (ax: number, tipY: number, sway: number, carry: boolean, rot: number): void => {
      const len = Math.max(0, tipY - topY);
      const rad = (sway * Math.PI) / 180;
      const tx = ax + Math.sin(rad) * len, ty = topY + Math.cos(rad) * len;
      line.style.transform = `translate(${ax}px, ${topY}px) rotate(${-sway}deg)`;
      line.style.height = `${len}px`;
      hook.style.transform = `translate(${tx - 9}px, ${ty - 8}px)`;
      if (carry) koma.style.transform = `translate(${tx - KOMA_W / 2}px, ${ty}px) rotate(${rot}deg) scale(1.25)`;
    };
    // 1) 糸が下りて、駒札に届く
    getSound().play('reel');
    const yHook = p.y0 - 2;
    await ctx.tween(420, (t) => place(cx0, topY + (yHook - topY) * easeOut(t), 0, false, 0));
    // 2) 引っかけて、ひょいっと釣り上げる
    if (p.src) p.src.style.opacity = '.25';
    fly.append(koma);
    getSound().play('tick');
    const yUp = Math.max(40, box.height * 0.28);
    const inward = cx0 < box.width / 2 ? 1 : -1;
    await ctx.tween(380, (t) => place(cx0, yHook + (yUp - yHook) * easeOut(t), inward * Math.abs(Math.sin(t * Math.PI * 2)) * 6, true, p.flipFrom + Math.sin(t * Math.PI * 3) * 12), (t) => t);
    // 3) 竿が振られて、自分の駒台の上へ（振り子のように揺れながら、向きを変える）
    getSound().play('reel', { gain: 0.7 });
    await ctx.tween(620, (t) => {
      const ax = cx0 + (cx2 - cx0) * easeInOut(t);
      // 振れは画面の内側へ（端の駒台でも、駒札が画面の外へ出ないように）
      const sway = (ax < box.width / 2 ? 1 : -1) * Math.sin(Math.PI * t) * 16;
      place(ax, yUp - Math.sin(Math.PI * t) * 30, sway, true, p.flipFrom + (p.flipTo - p.flipFrom) * t);
    });
    // 4) 下ろして、駒台へポン
    const yDown = p.y2 - 2;
    await ctx.tween(300, (t) => place(cx2, yUp + (yDown - yUp) * (t * t), 0, true, p.flipTo));
    getSound().play('komaHard', { gain: 0.8 });
    koma.style.filter = 'brightness(1.5)';
    await ctx.tween(200, (t) => {
      const k = 1.25 + Math.sin(Math.PI * t) * 0.35 - 0.25 * t;
      koma.style.transform = `translate(${p.x2}px, ${p.y2}px) rotate(${p.flipTo}deg) scale(${k.toFixed(3)})`;
      koma.style.filter = `brightness(${(1.5 - 0.5 * t).toFixed(2)})`;
    }, easeOut);
  },
  async after(ctx, cue) {
    const els = live.get(cue) ?? [];
    const [glow, line, hook] = els;
    // 糸が巻き上がって消える
    if (line && hook) {
      getSound().play('reel', { gain: 0.5 });
      const h0 = parseFloat(line.style.height) || 0;
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(hook.style.transform);
      const hx = m ? Number(m[1]) : 0, hy = m ? Number(m[2]) : 0;
      await ctx.tween(360, (t) => {
        line.style.height = `${h0 * (1 - t)}px`;
        hook.style.transform = `translate(${hx}px, ${hy - h0 * t}px)`;
        if (glow) glow.style.opacity = String(1 - t);
      }, (t) => t * t);
    }
    await ctx.wait(250);
  },
  cleanup(_ctx, cue) {
    for (const el of live.get(cue) ?? []) el.remove();
    live.delete(cue);
    // 薄くした駒札は描き直しで戻るが、念のため戻す
    for (const k of _ctx.hud.root.querySelectorAll<HTMLElement>('.komadai .koma')) if (k.style.opacity === '.25' || k.style.opacity === '0.25') k.style.opacity = '';
  },
};
