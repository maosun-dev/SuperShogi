// Three.js の描画・カメラ・毎フレームの更新・小さな動きの道具（tween）。
// renderer は1つだけ作り、画面ごとに attach で描画先を付け替えて使い回す。
import * as THREE from 'three';
import { PAL } from './palette';
import { cameraDistance, titleCameraDistance, titleViewDir, TITLE_FOV, TITLE_LOOK, TITLE_SWAY } from './fit';
import { buildBoard } from './board3d';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  home: { pos: THREE.Vector3; look: THREE.Vector3 };     // 普段の視点（画面の大きさが変わるたびに計算し直す）
  cam: { pos: THREE.Vector3; look: THREE.Vector3 };      // 今の視点（演出が動かす）
  shake: number;                                         // 揺れの強さ（毎フレーム減る）
  tween(ms: number, fn: (t: number) => void, ease?: (t: number) => number): Promise<void>;
  onFrame(fn: (dt: number, now: number) => void): () => void;  // 戻り値で外す
  mode: 'title' | 'match';                               // title：盤の周りをゆっくり回る
  attach(el: HTMLElement): void;                         // 画面ごとに描画先を付け替える
}

export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const FOV = 38;
const LOOK = new THREE.Vector3(0, -0.4, 0.35);          // 試作の baseLook
const VIEW_DIR = new THREE.Vector3(0, 0.9, 0.42).normalize();
const TITLE_SPEED = 0.4;       // タイトルで左右に揺れる速さ（1往復およそ16秒）
const TITLE_STILL_ANGLE = 0.15; // 動きを減らす設定のときは、この角度で止めておく

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Tw { t0: number; dur: number; fn: (t: number) => void; ease: (t: number) => number; res: () => void }

let stage: Stage | null = null;

function createStage(): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap は three 0.186 で廃止（使うと警告が出て PCFShadowMap に替わる）
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);

  // 光（試作の値）
  scene.add(new THREE.HemisphereLight(PAL.skyLight, PAL.yoruGround, 1.1));
  const sun = new THREE.DirectionalLight(PAL.sunLight, 1.9);
  sun.position.set(-5, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  scene.add(sun);

  const tweens: Tw[] = [];
  const frameFns = new Set<(dt: number, now: number) => void>();
  let mode: 'title' | 'match' = 'match';
  let titleTime = 0;
  let titleDist = 30;   // タイトルのカメラの距離（fit で画面の縦横比から決める）
  let host: HTMLElement | null = null;
  const ro = new ResizeObserver(() => fit());

  const s: Stage = {
    scene, camera, canvas,
    home: { pos: new THREE.Vector3(), look: LOOK.clone() },
    cam: { pos: new THREE.Vector3(), look: LOOK.clone() },
    shake: 0,
    tween(ms, fn, ease = (t) => t) {
      return new Promise<void>((res) => {
        if (ms <= 0) { fn(ease(1)); res(); return; }
        tweens.push({ t0: performance.now(), dur: ms, fn, ease, res });
      });
    },
    onFrame(fn) {
      frameFns.add(fn);
      return () => { frameFns.delete(fn); };
    },
    get mode() { return mode; },
    set mode(m) {
      mode = m;
      // タイトルだけ広角のレンズにする（fit.ts の TITLE_FOV）
      camera.fov = m === 'title' ? TITLE_FOV : FOV;
      camera.updateProjectionMatrix();
      if (m === 'match') { s.cam.pos.copy(s.home.pos); s.cam.look.copy(s.home.look); }
    },
    attach(el) {
      if (canvas.parentElement !== el) el.append(canvas);
      if (host !== el) {
        ro.disconnect();
        ro.observe(el);
        host = el;
      }
      fit();
    },
  };

  // 画面の大きさに合わせてカメラの距離を決め直す（試作の fitCamera）
  function fit(): void {
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const d = cameraDistance(camera.aspect, FOV);
    titleDist = titleCameraDistance(camera.aspect);
    // 今の視点が普段の視点にいるときだけ一緒に動かす（演出中の寄りは邪魔しない）
    const atHome = s.cam.pos.distanceTo(s.home.pos) < 1e-6 && s.cam.look.distanceTo(s.home.look) < 1e-6;
    s.home.pos.copy(LOOK).addScaledVector(VIEW_DIR, d);
    s.home.look.copy(LOOK);
    if (atHome || mode === 'title') { s.cam.pos.copy(s.home.pos); s.cam.look.copy(s.home.look); }
  }

  buildBoard(s);

  let last = performance.now();
  const off = new THREE.Vector3();
  function frame(now: number): void {
    // 先に次のフレームを頼んでおく（途中で例外が出ても描画が止まらないように）
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const p = Math.min(1, (now - tw.t0) / tw.dur);
      try {
        tw.fn(tw.ease(p));
      } catch (e) {
        // 1つの失敗でほかの動き・描画・待ちを止めない：外して終わったことにする
        console.error('動きの途中で失敗しました', e);
        tweens.splice(i, 1);
        tw.res();
        continue;
      }
      if (p >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    for (const fn of frameFns) {
      try { fn(dt, now); } catch (e) { console.error('毎フレームの処理で失敗しました', e); }
    }
    if (mode === 'title') {
      // 低めの広角から盤を見て、左右にゆっくり揺れる
      titleTime += dt;
      const angle = reducedMotion() ? TITLE_STILL_ANGLE : TITLE_SWAY * Math.sin(titleTime * TITLE_SPEED);
      const dir = titleViewDir(angle);
      off.set(dir[0], dir[1], dir[2]).multiplyScalar(titleDist);
      s.cam.look.set(TITLE_LOOK[0], TITLE_LOOK[1], TITLE_LOOK[2]);
      s.cam.pos.copy(s.cam.look).add(off);
    }
    camera.position.copy(s.cam.pos);
    if (s.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * s.shake;
      camera.position.y += (Math.random() - 0.5) * s.shake;
      s.shake = Math.max(0, s.shake - dt * 0.9);
    }
    camera.lookAt(s.cam.look);
    if (canvas.isConnected && host && host.clientWidth > 0) renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return s;
}

/** 画面すべてで共有する舞台（初めて呼ばれたときに作る） */
export function getStage(): Stage {
  if (!stage) stage = createStage();
  return stage;
}
