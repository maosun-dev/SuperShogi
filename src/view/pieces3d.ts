// 駒の形と字・sync(局面) で駒・纏札の印（札ごとの小さな物）・自分の伏せたマスの印・王手の輪・凍結と成れないの印を揃える。
// 駒の形・字の貼り方は試作（docs/mockups/look-mockup.html）の値をそのまま使う。
import * as THREE from 'three';
import type { CardId, GameState, Piece, PieceKind, Side } from '../rules/types';
import { isInCheck } from '../rules/moves';
import type { Stage } from './stage';
import { PAL, PALS, rgba } from './palette';
import { CW, CD, addPulse, decal, disposeTree, ring, squarePos } from './board3d';
import { armorPlate, banner, chainRing, flame, flutter, hoofprint, ironBall, umbrella } from './equipProps';
import { CARD_ART } from './cardArt';

/** 盤の上の駒の高さ（駒の物の原点の y） */
export const PIECE_Y = 0.02;

// 駒の大きさ（試作の SIZE を種類ごとに）
const SIZE: Record<PieceKind, number> = { OU: 1, HI: 0.95, KA: 0.95, KI: 0.93, GI: 0.93, KE: 0.88, KY: 0.86, FU: 0.82 };
const LABEL: Record<PieceKind, string> = { OU: '玉', HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩' };
// 成り駒は1文字にする（成香・成桂・成銀は 杏・圭・全）
const PROMOTED: Partial<Record<PieceKind, string>> = { FU: 'と', KY: '杏', KE: '圭', GI: '全', KA: '馬', HI: '竜' };

/** 駒に書く字と、その色（成り駒は紅）。演出でも使う */
export function labelOf(p: Piece): { ch: string; color: string } {
  if (p.kind === 'OU') return { ch: p.side === 'sente' ? '玉' : '王', color: PALS.sumi };
  if (p.promoted && PROMOTED[p.kind]) return { ch: PROMOTED[p.kind]!, color: PALS.wana };
  return { ch: LABEL[p.kind], color: PALS.sumi };
}

/** 駒の裏に書く字（成ったときの字・紅）。成れない駒（金・王）と、もう成った駒は null */
export function backLabelOf(p: Piece): { ch: string; color: string } | null {
  if (p.promoted) return null;
  const ch = PROMOTED[p.kind];
  return ch ? { ch, color: PALS.wana } : null;
}

// ---------- 形と材質（使い回す） ----------
const pieceMat = new THREE.MeshStandardMaterial({ color: PAL.kayaLight, roughness: 0.45 });
const frozenMat = new THREE.MeshStandardMaterial({ color: PAL.mahouPale, roughness: 0.4 });
const geoCache = new Map<number, THREE.ExtrudeGeometry>();
function pieceGeo(s: number): THREE.ExtrudeGeometry {
  const hit = geoCache.get(s);
  if (hit) return hit;
  const sh = new THREE.Shape();
  sh.moveTo(-0.36 * s, -0.42 * s); sh.lineTo(0.36 * s, -0.42 * s); sh.lineTo(0.29 * s, 0.28 * s);
  sh.lineTo(0, 0.44 * s); sh.lineTo(-0.29 * s, 0.28 * s); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.16 * s, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);   // 先端が奥（相手側）を向く
  geoCache.set(s, g);
  return g;
}

// 字の模様。文字の読み込みが終わったら描き直す
interface Label { ch: string; color: string; canvas: HTMLCanvasElement; mat: THREE.MeshStandardMaterial }
const labels = new Map<string, Label>();
const LABEL_FONT = '800 104px "Shippori Mincho B1", serif';

function drawLabel(l: Label): void {
  const g = l.canvas.getContext('2d')!;
  g.clearRect(0, 0, l.canvas.width, l.canvas.height);
  g.fillStyle = l.color;
  g.font = LABEL_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(l.ch, 64, 90);
  if (l.mat.map) l.mat.map.needsUpdate = true;
}

function labelMat(ch: string, color: string): THREE.MeshStandardMaterial {
  const key = `${ch}|${color}`;
  const hit = labels.get(key);
  if (hit) return hit.mat;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 160;
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6 });
  const l: Label = { ch, color, canvas, mat };
  drawLabel(l);
  labels.set(key, l);
  return mat;
}

let fontWatch = false;
function watchFont(): void {
  if (fontWatch || typeof document === 'undefined' || !document.fonts) return;
  fontWatch = true;
  document.fonts.load(LABEL_FONT).then(() => { for (const l of labels.values()) drawLabel(l); }, () => {});
}

const labelGeoCache = new Map<number, THREE.PlaneGeometry>();
function labelGeo(s: number): THREE.PlaneGeometry {
  let g = labelGeoCache.get(s);
  if (!g) { g = new THREE.PlaneGeometry(0.5 * s, 0.625 * s); labelGeoCache.set(s, g); }
  return g;
}

// 装備の札の絵（SVG → 画像 → キャンバスの模様）
const artCache = new Map<CardId, THREE.CanvasTexture>();
function artTexture(id: CardId): THREE.CanvasTexture {
  const hit = artCache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 92; c.height = 124;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = c.getContext('2d')!;
  // 読み込みまでは紙の色の札だけ見せる
  g.fillStyle = PALS.gofun; g.fillRect(0, 0, c.width, c.height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 62" width="92" height="124">`
    + `<rect width="46" height="62" rx="3" fill="${PALS.gofun}" stroke="${PALS.soubi}" stroke-width="3"/>${CARD_ART[id]}</svg>`;
  const img = new Image();
  img.onload = () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); t.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  artCache.set(id, t);
  return t;
}

// ---------- 駒1つぶんの物 ----------
interface PieceObj {
  grp: THREE.Group;
  body: THREE.Mesh;
  label: THREE.Mesh;
  back: THREE.Mesh | null;  // 裏の字（成りで裏返すと見える）。成れない駒は null
  kind: PieceKind;
  side: Side;
  equip: { id: CardId; obj: THREE.Group; stop: () => void } | null;
  shackle: { obj: THREE.Group; stop: () => void } | null;   // 重りの枷（纏札とは別に付く）
  check: { obj: THREE.Mesh; stop: () => void } | null;
  marks: { key: string; obj: THREE.Group } | null;   // 凍結・成れないの印（key が変わったら作り直す）
}

const objs = new Map<number, PieceObj>();
let spinOff: (() => void) | null = null;
// 纏札の印のうち動く物（はためく旗など）。毎フレーム、経った秒数を渡す
const animating = new Set<(t: number) => void>();
let animTime = 0;

function makePiece(p: Piece): PieceObj {
  const s = SIZE[p.kind], grp = new THREE.Group();
  const body = new THREE.Mesh(pieceGeo(s), pieceMat); body.castShadow = true; body.receiveShadow = true; grp.add(body);
  const lb = labelOf(p);
  const label = new THREE.Mesh(labelGeo(s), labelMat(lb.ch, lb.color));
  label.rotation.x = -Math.PI / 2; label.position.set(0, 0.16 * s + 0.026, 0.03 * s);
  grp.add(label);
  grp.userData = { pieceId: p.id, s };
  const o: PieceObj = { grp, body, label, back: null, kind: p.kind, side: p.side, equip: null, shackle: null, check: null, marks: null };
  syncBack(o, p);
  return o;
}

/**
 * 裏の字を局面に合わせる。底の面のすぐ下に下向きに貼り、駒を前後の軸（z 軸）まわりに π 回したとき
 * 正しく読める向きにする（字の右が -x・上が -z・面が -y。回すと右 +x・上 -z・面 +y で表の字と同じ向きになる）
 */
function syncBack(o: PieceObj, p: Piece): void {
  const lb = backLabelOf(p);
  if (!lb) { if (o.back) o.back.visible = false; return; }
  const s = SIZE[p.kind];
  if (!o.back) {
    o.back = new THREE.Mesh(labelGeo(s), labelMat(lb.ch, lb.color));
    o.grp.add(o.back);
  }
  o.back.material = labelMat(lb.ch, lb.color);
  o.back.position.set(0, -0.026, 0.03 * s);
  o.back.rotation.set(Math.PI / 2, Math.PI, 0, 'YXZ');
  o.back.scale.set(1, 1, 1);
  o.back.visible = true;
}

/**
 * 成りの裏返しが終わった駒を、その駒だけ成った見た目に整える（表の字を裏の字に替え、向きと高さを戻す）。
 * 盤全体を揃える sync は、同じ手番のあとに続く演出のために最後まで待つ。成れない駒・盤にない駒は何もしない
 */
export function settleFlipped(id: number): void {
  const o = objs.get(id);
  if (!o || !o.back) return;
  o.label.material = o.back.material;
  o.back.visible = false;
  o.grp.rotation.set(0, o.grp.rotation.y, 0);
  o.grp.position.y = PIECE_Y;
}

// ---------- 選んだ駒を浮かせる ----------
/** 選んだ駒が浮く高さ（盤からの上乗せ） */
export const LIFT_Y = 0.22;
const LIFT_MS = 120;
let lifted: { id: number; age: number } | null = null;
const lowering = new Map<number, { from: number; age: number }>();
let liftOff: (() => void) | null = null;

/** その駒を浮かせ、かすかに上下させる。前に浮いていた駒は滑らかに下ろす。null なら下ろすだけ */
export function setLifted(stage: Stage, id: number | null): void {
  if ((lifted?.id ?? null) === id) return;
  if (!liftOff) {
    liftOff = stage.onFrame((dt) => {
      if (lifted) {
        const o = objs.get(lifted.id);
        if (!o) { lifted = null; } else {
          lifted.age += dt * 1000;
          const k = Math.min(1, lifted.age / LIFT_MS);
          const up = 1 - Math.pow(1 - k, 3);
          o.grp.position.y = PIECE_Y + LIFT_Y * up + Math.sin(lifted.age / 250) * 0.015 * up;
        }
      }
      for (const [lid, l] of [...lowering]) {
        const o = objs.get(lid);
        l.age += dt * 1000;
        const k = Math.min(1, l.age / LIFT_MS);
        if (o) o.grp.position.y = l.from + (PIECE_Y - l.from) * (1 - Math.pow(1 - k, 3));
        if (k >= 1 || !o) lowering.delete(lid);
      }
    });
  }
  if (lifted) {
    const o = objs.get(lifted.id);
    if (o) lowering.set(lifted.id, { from: o.grp.position.y, age: 0 });
  }
  lifted = id === null ? null : { id, age: 0 };
  if (id !== null) lowering.delete(id);
}

/** 浮いている駒を、今の高さのまま手放す（下ろす動きもやめる）。このあと演出が位置を引き継ぐ */
export function releaseLift(): void {
  lifted = null;
  lowering.clear();
}

// ---------- 凍結・成れないの印（駒の手前左の盤の上に寝かせる） ----------
const KANSUJI = ['〇', '一', '二', '三', '四', '五'];
const markMats = new Map<string, THREE.MeshBasicMaterial>();

/** 印の材質（使い回す）。frozen（f+数）：藍の丸に胡粉の数字（残りの手番）。sealed：紅の角印に「封」。
 *  重りの枷（o+数）：金箔の丸に墨の数字（外れるまでの手番）。痺れ（n+数）：墨の丸に金の稲妻のジグザグ。
 *  3マスまで（reach）：胡粉の角に墨の点が三つ（滑れるのは3マスまで） */
function markMat(key: string): THREE.MeshBasicMaterial {
  const hit = markMats.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (key === 'sealed') {
    g.save(); g.translate(64, 64); g.rotate(-0.12);
    g.fillStyle = PALS.wana; g.fillRect(-50, -50, 100, 100);
    g.strokeStyle = PALS.gofun; g.lineWidth = 5; g.strokeRect(-40, -40, 80, 80);
    g.fillStyle = PALS.gofun; g.font = '800 64px "Shippori Mincho B1", serif'; g.fillText('封', 0, 4);
    g.restore();
  } else if (key === 'reach') {
    g.save(); g.translate(64, 64); g.rotate(0.08);
    g.fillStyle = PALS.gofun; g.fillRect(-50, -50, 100, 100);
    g.strokeStyle = PALS.mahou; g.lineWidth = 6; g.strokeRect(-42, -42, 84, 84);
    g.fillStyle = PALS.sumi;
    for (const x of [-26, 0, 26]) { g.beginPath(); g.arc(x, 0, 10, 0, Math.PI * 2); g.fill(); }
    g.restore();
  } else if (key.startsWith('n')) {
    g.fillStyle = PALS.sumi; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PALS.soubi; g.lineWidth = 9; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(74, 20); g.lineTo(46, 64); g.lineTo(76, 62); g.lineTo(52, 108); g.stroke();
  } else if (key.startsWith('o')) {
    const n = Number(key.slice(1));
    g.fillStyle = PALS.soubi; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PALS.sumi; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PALS.sumi; g.font = '800 66px "Shippori Mincho B1", serif'; g.fillText(KANSUJI[n] ?? String(n), 64, 68);
  } else {
    const n = Number(key.slice(1));
    g.fillStyle = PALS.mahou; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PALS.mahouPale; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PALS.gofun; g.font = '800 66px "Shippori Mincho B1", serif'; g.fillText(KANSUJI[n] ?? String(n), 64, 68);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // 駒の陰に隠れないよう、いつも上に描く
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false });
  markMats.set(key, m);
  return m;
}

const markGeo = new THREE.PlaneGeometry(0.56, 0.56);

/** 駒の印の組。凍結（f+数）・重りの枷（o+数）・成れない（sealed）を手前左に縦に並べる */
function makeMarks(keys: string[], side: Side): THREE.Group {
  const g = new THREE.Group();
  const flip = side === 'gote' ? -1 : 1;  // 後手の駒は π 回っているので打ち消す
  keys.forEach((k, i) => {
    const m = new THREE.Mesh(markGeo, markMat(k));
    m.renderOrder = 6;
    m.rotation.x = -Math.PI / 2;
    if (side === 'gote') m.rotation.z = Math.PI;
    m.position.set(-0.36 * flip, 0.035 - PIECE_Y, (0.3 - i * 0.56) * flip);
    g.add(m);
  });
  return g;
}

function removeMarks(o: PieceObj): void {
  if (!o.marks) return;
  o.grp.remove(o.marks.obj);
  o.marks = null; // 形と材質は使い回すので捨てない
}

/** 纏札の印：札ごとの小さな物（旗・蹄の跡・鎧の板・鎖と鉄球・槍・炎）と、その札の絵の小さな板。
 *  物は駒の組の中に置くので、後手の駒では向きも一緒に回る。動く物（はためく旗・瞬く跡・揺れる炎）は anim で動かす */
function makeEquip(id: CardId, side: Side, s: number): { obj: THREE.Group; stop: () => void } {
  const g = new THREE.Group();
  const floor = 0.012 - PIECE_Y; // 盤の面の高さ（駒の組の中で）
  let step: ((t: number) => void) | null = null;
  switch (id) {
    case 'hikijin': {
      // 駒の左わきの小旗（旗は外へはためく。駒の手前に立てると、見る側から字が隠れるため）
      const b = banner(0.72, false);
      b.position.set(-0.4 * s, 0.02, 0.1 * s);
      b.rotation.y = Math.PI;
      g.add(b);
      const flag = b.userData.flag as THREE.Mesh;
      step = (t) => flutter(flag, t, 0.8);
      break;
    }
    case 'tenma': {
      // 足元に光る蹄の跡（ゆっくり瞬く）
      const prints = [hoofprint(0.34, false), hoofprint(0.34, false)];
      prints[0].position.set(-0.36 * s, floor + 0.004, 0.36 * s);
      prints[1].position.set(-0.4 * s, floor + 0.004, -0.1 * s);
      prints[1].rotation.z = 0.3;
      g.add(...prints);
      step = (t) => { prints.forEach((p, i) => { p.material.opacity = 0.55 + 0.4 * Math.sin(t * 2.4 + i * 1.6); }); };
      break;
    }
    case 'hagane': {
      // 駒の両わきに鎧の板
      for (const k of [-1, 1]) {
        const plate = armorPlate(s);
        plate.position.set(k * 0.39 * s, 0.1 * s, 0.02 * s);
        // 鋲の側を外へ向け、上を駒へ寄せて斜めに立てかける
        plate.rotation.set(0, k > 0 ? 0 : Math.PI, 0.5);
        g.add(plate);
      }
      break;
    }
    case 'omori': {
      // 足元の鎖と、小さな鉄球
      const chain = chainRing(0.46 * s, 14);
      chain.position.y = floor + 0.045;
      const ball = ironBall(0.13);
      ball.position.set(0.5 * s, floor + 0.13, -0.2 * s);
      g.add(chain, ball);
      break;
    }
    case 'bangasa': {
      // 駒の後ろに差した小さな番傘（紅の和紙に胡粉の骨）。少し後ろへ傾ける
      const u = umbrella(0.34 * s);
      u.position.set(-0.3 * s, 0.62 * s, 0.22 * s);
      u.rotation.set(0.35, 0, 0.25);
      g.add(u);
      break;
    }
    case 'idaten': {
      // 足元の小さな炎（ゆらめく）
      const fl = [flame(0.5, false), flame(0.4, false)];
      fl[0].position.set(-0.38 * s, floor, 0.3 * s);
      fl[1].position.set(-0.4 * s, floor, -0.15 * s);
      g.add(...fl);
      step = (t) => {
        fl.forEach((f, i) => {
          const k = 1 + Math.sin(t * 13 + i * 2) * 0.12 + Math.sin(t * 7.3 + i) * 0.08;
          const h = (i ? 0.4 : 0.5) * k;
          f.scale.set(h * 0.5, h, 1);
        });
      };
      break;
    }
  }
  // 札の絵：駒に隠れないよう、手前右の角に寝かせて置く（見る側から見て正しい向き）
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.48),
    new THREE.MeshBasicMaterial({ map: artTexture(id), transparent: true, depthWrite: false }));
  art.rotation.x = -Math.PI / 2;
  const flip = side === 'gote' ? -1 : 1;  // 後手の駒は π 回っているので、置き場所と向きを打ち消す
  art.position.set(0.4 * flip, 0.03 - PIECE_Y, 0.4 * flip);
  if (side === 'gote') art.rotation.z = Math.PI;
  g.add(art);
  if (step) animating.add(step);
  const st = step;
  return {
    obj: g,
    stop: () => { if (st) animating.delete(st); },
  };
}

function removeEquip(o: PieceObj): void {
  if (!o.equip) return;
  disposeProp(o, o.equip);
  o.equip = null;
}

function removeShackle(o: PieceObj): void {
  if (!o.shackle) return;
  disposeProp(o, o.shackle);
  o.shackle = null;
}

function disposeProp(o: PieceObj, prop: { obj: THREE.Group; stop: () => void }): void {
  prop.stop();
  o.grp.remove(prop.obj);
  // 札の絵の模様は使い回すので捨てない
  prop.obj.traverse((x) => {
    const m = x as THREE.Mesh;
    if ((x as THREE.Sprite).isSprite) { (m.material as THREE.Material).dispose(); return; } // 板の形は three の中で共有
    if (!m.isMesh) return;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
}

function removeCheck(o: PieceObj): void {
  if (!o.check) return;
  o.check.stop();
  o.grp.remove(o.check.obj);
  disposeTree(o.check.obj);
  o.check = null;
}

function removePiece(stage: Stage, id: number, o: PieceObj): void {
  removeEquip(o);
  removeShackle(o);
  removeMarks(o);
  removeCheck(o);
  stage.scene.remove(o.grp);
  o.grp.parent?.remove(o.grp);
  objs.delete(id);
}

// ---------- 自分がマスに伏せた札の印（落とし穴は紅の「穴」、凍てつく床は藍の「氷」） ----------
const pits = new Map<number, { obj: THREE.Mesh; key: string; stop: () => void }>();

function makePit(cardId: CardId | null): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const frost = cardId === 'itetsuku';
  const color = frost ? PAL.mahou : PAL.wana;
  return decal((g) => {
    g.strokeStyle = rgba(color, 0.95); g.lineWidth = 10; g.setLineDash([22, 14]); g.strokeRect(18, 18, 220, 220);
    g.fillStyle = rgba(color, 0.9); g.font = '800 92px "Shippori Mincho B1", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(frost ? '氷' : '穴', 128, 134);
  }, CW * 0.92, CD * 0.92);
}

/** 駒の表の字の板（演出で光らせるため。材質は共有なので、変えるときは複製を差し替える） */
export function pieceLabel(id: number): THREE.Mesh | undefined {
  return objs.get(id)?.label;
}

/** 駒の物（演出で動かすため）。盤にない駒は undefined */
export function pieceMesh(id: number): THREE.Object3D | undefined {
  return objs.get(id)?.grp;
}

/** 盤にある駒の物すべて（エンディングで踊らせるため） */
export function allPieceMeshes(): THREE.Object3D[] {
  return [...objs.values()].map((o) => o.grp);
}

/**
 * 盤の物を局面どおりに揃える。view は viewFor 済みの局面、me は画面を見ている側。
 * 演出のあとの安全網：演出が駒をどう動かしても（位置・向き・大きさ・見え方・材質を変えても）、
 * ここで全部の駒について局面から決まる値へ必ず戻す。演出は共有の材質を書き換えず、複製を差し替えること。
 */
export function sync(stage: Stage, view: GameState, me: Side): void {
  watchFont();
  // 下ろす途中の駒は、ここで局面の高さに揃う（浮いている駒はこのあとも浮かせ続ける）
  lowering.clear();
  if (!spinOff) {
    spinOff = stage.onFrame((dt) => {
      animTime += dt;
      for (const f of animating) f(animTime);
    });
  }
  const checked: Record<Side, boolean> = { sente: isInCheck(view, 'sente'), gote: isInCheck(view, 'gote') };
  const seen = new Set<number>();

  for (let i = 0; i < 81; i++) {
    const p = view.board[i];
    if (!p) continue;
    seen.add(p.id);
    let o = objs.get(p.id);
    // 種類や持ち主が変わったら作り直す（形の大きさが変わるため）
    if (o && (o.kind !== p.kind || o.side !== p.side)) { removePiece(stage, p.id, o); o = undefined; }
    if (!o) { o = makePiece(p); objs.set(p.id, o); }
    if (o.grp.parent !== stage.scene) stage.scene.add(o.grp);

    // 位置・向き・大きさ・見え方
    const pos = squarePos({ c: i % 9, r: Math.floor(i / 9) });
    o.grp.position.set(pos.x, PIECE_Y, pos.z);
    o.grp.rotation.set(0, p.side === 'gote' ? Math.PI : 0, 0);
    o.grp.scale.set(1, 1, 1);
    o.grp.visible = true;
    o.body.position.set(0, 0, 0); o.body.rotation.set(0, 0, 0); o.body.scale.set(1, 1, 1); o.body.visible = true;
    const s = SIZE[p.kind];
    o.label.position.set(0, 0.16 * s + 0.026, 0.03 * s); o.label.rotation.set(-Math.PI / 2, 0, 0); o.label.scale.set(1, 1, 1);
    o.label.visible = true;
    syncBack(o, p);

    // 字（成り）。演出が差し替えていても、いつも共有の字の材質へ戻す
    const lb = labelOf(p);
    o.label.material = labelMat(lb.ch, lb.color);

    // 凍った駒の青み（痺れは印だけで見分ける）
    o.body.material = p.frozen ? frozenMat : pieceMat;

    // 装備の六角形
    const eq = p.equip?.cardId ?? null;
    if (o.equip && o.equip.id !== eq) removeEquip(o);
    if (eq && !o.equip) {
      const e = makeEquip(eq, p.side, SIZE[p.kind]);
      e.obj.name = 'equip';
      o.grp.add(e.obj);
      o.equip = { id: eq, ...e };
    }

    // 重りの枷：纏札とは別に、足元の鎖と鉄球
    if (p.shackle && !o.shackle) {
      o.shackle = makeEquip('omori', p.side, SIZE[p.kind]);
      o.shackle.obj.name = 'shackle';
      o.grp.add(o.shackle.obj);
    } else if (!p.shackle) removeShackle(o);

    // 凍結（残りの手番）・重りの枷（外れるまでの手番）・成れないの印
    const left = p.shackle?.left;
    const keys = [
      ...(p.frozen ? [`f${p.frozen}`] : []), ...(p.numb ? [`n${p.numb}`] : []), ...(left ? [`o${left}`] : []),
      ...(p.reach ? ['reach'] : []), ...(p.sealed ? ['sealed'] : []),
    ];
    const mk = keys.join(',');
    if (o.marks && o.marks.key !== mk) removeMarks(o);
    if (keys.length > 0 && !o.marks) {
      const obj = makeMarks(keys, p.side);
      o.grp.add(obj);
      o.marks = { key: mk, obj };
    }

    // 王手の輪
    const inCheck = p.kind === 'OU' && checked[p.side];
    if (inCheck && !o.check) {
      const r = ring(0.52, 0.64, PAL.wana);
      r.position.y = 0.012 - PIECE_Y;
      o.grp.add(r);
      o.check = { obj: r, stop: addPulse(r.material, 0.45, 0.95, 4) };
    } else if (!inCheck) removeCheck(o);
  }
  for (const [id, o] of [...objs]) if (!seen.has(id)) removePiece(stage, id, o);

  // 自分の落とし穴（隠れていない、自分の罠で場所があるもの）
  const pitSeen = new Set<number>();
  for (const t of view.traps) {
    if (t.owner !== me || t.at === null) continue;
    pitSeen.add(t.uid);
    const key = `${t.at.c},${t.at.r}`;
    let pit = pits.get(t.uid);
    if (pit && pit.key !== key) { pit.obj.position.copy(squarePos(t.at)).setY(0.01); pit.key = key; }
    if (!pit) {
      const m = makePit(t.cardId);
      m.position.copy(squarePos(t.at)).setY(0.01);
      pit = { obj: m, key, stop: addPulse(m.material, 0.25, 0.6, 2) };
      pits.set(t.uid, pit);
    }
    if (pit.obj.parent !== stage.scene) stage.scene.add(pit.obj);
    pit.obj.visible = true;
  }
  for (const [uid, pit] of [...pits]) {
    if (pitSeen.has(uid)) continue;
    pit.stop();
    stage.scene.remove(pit.obj);
    disposeTree(pit.obj);
    pits.delete(uid);
  }
}
