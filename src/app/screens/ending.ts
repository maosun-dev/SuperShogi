// 大詰のエンディング（設計書 docs/superpowers/specs/2026-10-28-kabuki-ending-design.md）。
// 本番の傾奇者に勝つと、大見得のあとここへ来る。曲（サクラドリフト）の位置に合わせて、台本（ending/script.ts）どおりに
// 定式幕が開く → 題字「傾将棋」を横に大きく → 回り舞台に18枚の札が役者として立ち、正面の札の役名が出る → 桜が一気に舞って幕が閉まる →
// 幕の前に口上の紙（千穐楽・作・御礼）→ 大入袋と打ち出しの太鼓 → 結果画面（見返しなら設定）。
// 初めては飛ばせない。最後まで見たら記録し、2回目からと見返しは、画面を押すと「飛ばす」が出る
import * as THREE from 'three';
import type { CardId, Result } from '../../rules/types';
import { isLevel, type Level } from '../../ai/levels';
import { CARDS } from '../../cards';
import { getStage } from '../../view/stage';
import { BH } from '../../view/board3d';
import { allPieceMeshes } from '../../view/pieces3d';
import { getSound } from '../../fx/sound';
import { closedMakuEl, makeCurtain, makePetals, makeStandee, makeTurntable, type Standee } from '../../fx/ending/props';
import { CAST_ORDER, ENDING_LEN, ENDING_TRACK, ROLES, STAFF, castAt, sceneAt } from '../ending/script';
import { createEndingClock } from '../ending/clock';
import { canSkip } from '../ending/rules';
import { loadEndingSeen, markEndingSeen, safeStore } from '../storage';
import { keikoOf, type Keiko } from '../keiko';
import { showScreen, type Screen } from '../screens';
import { el, writeKouzan } from './ui';
import { brushChar } from './title';
import { oozumeGara } from './oozumeGara';

export interface EndingParams { result: Result; level: Level; deck: CardId[]; keiko?: Keiko; replay?: boolean }

const FLOOR = -BH - 1.3;          // 舞台の床の高さ（board3d の床と同じ）
const RING_IN = 7.9, RING_OUT = 11.4, CAST_R = 9.6; // 回り舞台の輪と、札を立てる半径
const ST_SCALE = 1.35;            // 札の板の大きさ
const TURN_FROM = 5, TURN_TO = 87; // 回り舞台の間（台本と同じ）
const STEP = (Math.PI * 2) / CAST_ORDER.length;
const START_WAIT_MS = 3000;       // 曲が鳴り始めるのを待つ長さ（鳴らなければ自分の時計で始める）
const SKIP_SHOW_MS = 3000;        // 「飛ばす」を出しておく長さ

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const ease = (x: number): number => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/** 縦書きの衡山の字（1字ずつ縦に積む） */
function kouzanColumn(cls: string, text: string): HTMLElement {
  const col = el('div', cls);
  col.setAttribute('aria-label', text);
  for (const ch of text) {
    const c = el('span', 'kz');
    writeKouzan(c, ch);
    c.removeAttribute('aria-label');
    col.append(c);
  }
  return col;
}

export function endingScreen(params: unknown): Screen {
  const p = (params ?? {}) as Partial<EndingParams>;
  const result: Result = p.result ?? { winner: 'sente', reason: 'king-captured' };
  const level: Level = isLevel(p.level) ? p.level : 'kabuki';
  const deck = p.deck ?? [];
  const keiko = keikoOf(p.keiko);
  const replay = p.replay === true;
  const devAt = import.meta.env.DEV ? Number((p as { devAt?: number }).devAt ?? 0) || 0 : 0;

  let offFrame: (() => void) | null = null;
  let finished = false;
  const cleanups: (() => void)[] = [];

  const leave = (complete: boolean): void => {
    if (finished) return;
    finished = true;
    if (complete && !replay) markEndingSeen(safeStore());
    if (replay) void showScreen('settings');
    else void showScreen('result', { result, level, deck, keiko });
  };

  return {
    mount(root) {
      const box = el('div', 'ending');
      box.dataset.screen = 'ending';
      const host = el('div', 'stage-host');
      const cast = el('div', 'ending-cast');
      const castRole = el('span', 'role');
      const castName = el('span', 'name');
      cast.append(castName, castRole);
      cast.setAttribute('aria-live', 'polite');

      // 口上の紙：千穐楽（衡山の縦書き）と、横書きのクレジット
      const kojo = el('div', 'ending-kojo');
      kojo.append(kouzanColumn('senshuraku', '千穐楽'));
      const staff = el('div', 'staff');
      for (const s of STAFF) {
        const row = el('div', 'row');
        const role = kouzanColumn('role', s.role);
        row.append(role, el('span', 'who', s.name));
        staff.append(row);
      }
      kojo.append(staff);
      const ooiri = el('div', 'ending-ooiri');
      ooiri.append(kouzanColumn('ooiri-word', '大入'));
      // 背景：傾奇者の振袖の柄を半透明にして、ゆっくり流す（2026-10-28 ユーザー「背景が寂しい」）
      const bg = el('div', 'ending-bg');
      bg.innerHTML = oozumeGara('kabuki'); // 定数だけでできた文字列
      // 題字：幕が開いたら、横書きで大きく（回り舞台が回り出す前）
      const title = el('div', 'ending-title');
      title.setAttribute('aria-label', '傾将棋');
      title.innerHTML = brushChar('傾', 'et-ji', 'var(--sumi)', 'var(--gofun)', 80, 18)
        + brushChar('将', 'et-ji', 'var(--gofun)', 'var(--sumi)', 80, 18)
        + brushChar('棋', 'et-ji', 'var(--gofun)', 'var(--sumi)', 80, 18); // 定数だけでできた文字列
      const skip = el('button', 'ending-skip', '飛ばす') as HTMLButtonElement;
      skip.type = 'button';
      kojo.append(ooiri); // 大入袋は口上の紙の右下に下げる
      // 始めの幕：大見得で閉めた幕と同じ画面の層の縞を、そのまま左右へ引いて開ける。
      // 3Dの絵には切り替えの瞬間まで前の画面（盤）が残っているので、閉まった姿から始めて隠しておく（2026-10-28 ちらつき）。
      // 3Dの幕は、終わりに閉まるところだけで使う
      const cover = closedMakuEl(40);
      const [coverL, coverR] = [...cover.children] as HTMLElement[];
      box.append(bg, host, title, cast, kojo, cover, skip);
      root.append(box);

      const skippable = replay || canSkip(loadEndingSeen(safeStore()));
      if (skippable) {
        let hideAt = 0;
        box.addEventListener('pointerdown', (e) => {
          if (e.target === skip) return;
          skip.classList.add('on');
          hideAt = performance.now() + SKIP_SHOW_MS;
          window.setTimeout(() => { if (performance.now() >= hideAt) skip.classList.remove('on'); }, SKIP_SHOW_MS + 50);
        });
        skip.addEventListener('click', () => leave(false));
      } else {
        skip.remove();
      }

      // ---- 舞台 ----
      const stage = getStage();
      stage.attach(host);
      stage.mode = 'match';
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const table = makeTurntable(RING_IN, RING_OUT, FLOOR + 0.36);
      stage.scene.add(table.root);
      cleanups.push(() => table.dispose());
      const standees: Standee[] = [];
      CAST_ORDER.forEach((id, i) => {
        // できた札から舞台に足す（読み込みで止めない）
        void makeStandee(id).then((s) => {
          if (finished && !offFrame) { s.dispose(); return; }
          const a = i * STEP;
          s.root.position.set(Math.sin(a) * CAST_R, FLOOR + 0.36, Math.cos(a) * CAST_R);
          s.root.rotation.y = a;
          s.root.scale.setScalar(ST_SCALE);
          table.ring.add(s.root);
          standees.push(s);
        }).catch((e: unknown) => console.error('札の板を作れませんでした', id, e));
      });
      cleanups.push(() => { for (const s of standees) s.dispose(); });
      const petals = makePetals(new THREE.Vector3(0, FLOOR, 6), 12, 8, reduced ? 60 : 260);
      stage.scene.add(petals.root);
      cleanups.push(() => petals.dispose());
      // 幕：カメラの前に、画面いっぱいより少し大きく
      const DIST = 2;
      const fovH = 2 * DIST * Math.tan((stage.camera.fov * Math.PI) / 360);
      const curtain = makeCurtain(fovH * Math.max(0.5, stage.camera.aspect) * 1.25, fovH * 1.25);
      stage.scene.add(curtain.root);
      cleanups.push(() => curtain.dispose());

      // カメラ：回り舞台の正面の札と、その奥の盤が見えるところ
      const camPos = new THREE.Vector3(0, FLOOR + 7.5, CAST_R + 13);
      const camLook = new THREE.Vector3(0, FLOOR + 1.2, CAST_R - 5);
      stage.cam.pos.copy(camPos);
      stage.cam.look.copy(camLook);
      // 最初の1コマから、幕が閉まった姿で映るように：カメラと幕をいまの位置に置いておく
      stage.camera.position.copy(camPos);
      stage.camera.lookAt(camLook);
      curtain.root.position.copy(camPos).addScaledVector(camLook.clone().sub(camPos).normalize(), DIST);
      curtain.root.quaternion.copy(stage.camera.quaternion);
      curtain.setOpen(1);
      curtain.root.visible = false;

      // 盤の駒の総踊り：回り舞台の間、駒が波のように順に跳ねて少し揺れる（2026-10-28 ユーザー「盤面は適当に動かしてもいい」）
      const dancers = allPieceMeshes().map((m) => ({ m, y: m.position.y, rz: m.rotation.z, phase: (m.position.x + m.position.z) * 0.55 }));
      cleanups.push(() => { for (const d of dancers) { d.m.position.y = d.y; d.m.rotation.z = d.rz; } });

      // ---- 時計と台本 ----
      // 幕が開く柝は、画面の切り替えの音（main.ts の setClapper）が鳴らす
      const sound = getSound();
      const mountedAt = performance.now();
      let clock: ReturnType<typeof createEndingClock> | null = null;
      let shownCast: CardId | null = null;
      const once = new Set<string>();
      const at = (key: string, t: number, when: number, fn: () => void): void => {
        if (t >= when && !once.has(key)) { once.add(key); fn(); }
      };
      const fwd = new THREE.Vector3();

      offFrame = stage.onFrame((dt, now) => {
        if (!clock) {
          const started = sound.musicTime(ENDING_TRACK) !== null || now - mountedAt > START_WAIT_MS;
          if (started) clock = createEndingClock({ musicTime: () => sound.musicTime(ENDING_TRACK), now: () => performance.now() });
        }
        // 試し口の &at=<秒>：場面だけを先へずらして見る
        const t = (clock ? clock.t() : 0) + devAt;
        const scene = sceneAt(t);

        // 始めの幕（画面の層）：左右へ引いて開ける。開ききったら外す
        const first = ease((t - 0.6) / 3.4);
        if (cover.isConnected) {
          coverL.style.transform = `translateX(${(-100 * first).toFixed(2)}%)`;
          coverR.style.transform = `translateX(${(100 * first).toFixed(2)}%)`;
          if (first >= 1) cover.remove();
        }
        // 終わりの幕（3D）：bloom で閉まる。それまでは開いたまま見せない
        curtain.root.visible = t >= TURN_TO;
        curtain.setOpen(t < TURN_TO ? 1 : 1 - ease((t - TURN_TO) / 6));
        if (!reduced) curtain.sway(now);
        stage.camera.getWorldDirection(fwd);
        curtain.root.position.copy(stage.camera.position).addScaledVector(fwd, DIST);
        curtain.root.quaternion.copy(stage.camera.quaternion);

        // 回り舞台：正面に来る札が castAt と合うように回す
        const u = Math.min(TURN_TO, Math.max(TURN_FROM, t));
        const w = (TURN_TO - TURN_FROM) / CAST_ORDER.length;
        table.setTurn(-((u - TURN_FROM) / w - 0.5) * STEP);

        // 駒の総踊り（回り舞台の間だけ。動きを減らす設定では踊らない）
        if (!reduced) {
          const on = t >= TURN_FROM && t < TURN_TO ? Math.min(1, (t - TURN_FROM) / 2, (TURN_TO - t) / 2) : 0;
          for (const d of dancers) {
            const w = Math.sin(t * 3.2 - d.phase);
            d.m.position.y = d.y + on * Math.max(0, w) * 0.5;
            d.m.rotation.z = d.rz + on * Math.sin(t * 1.6 - d.phase) * 0.08;
          }
        }

        // 正面の札の名と役名
        const c = castAt(t);
        if (c !== shownCast) {
          shownCast = c;
          if (c) { castName.textContent = CARDS[c].name; castRole.textContent = ROLES[c]; cast.classList.add('on'); }
          else cast.classList.remove('on');
        }

        // 桜
        petals.setAmount(scene === 'bloom' ? 1 : scene === 'kojo' ? 0.55 : scene === 'ooiri' ? 0.75 : t < TURN_FROM ? 0.08 : 0.16);
        petals.update(dt); // dt は秒（舞台の onFrame）

        title.classList.toggle('on', t >= 1.2 && t < TURN_FROM);
        // 題字は出ている間、今の大きさからゆっくり寄っていく（2026-10-28 ユーザー）
        if (!reduced) title.style.setProperty('--z', (1 + 0.16 * clamp01((t - 1.2) / (TURN_FROM + 0.9 - 1.2))).toFixed(4));
        kojo.classList.toggle('on', t >= 95);
        ooiri.classList.toggle('on', t >= 105);
        at('close', t, TURN_TO + 4.5, () => sound.play('maku'));
        at('don', t, 105.4, () => sound.play('drum', { gain: 1 })); // 打ち出しの太鼓は1回（2026-10-28 ユーザー）
        if (t >= ENDING_LEN) leave(true);
      });
    },
    unmount() {
      finished = true;
      offFrame?.();
      offFrame = null;
      for (const f of cleanups.splice(0)) f();
      const stage = getStage();
      stage.cam.pos.copy(stage.home.pos);
      stage.cam.look.copy(stage.home.look);
    },
  };
}
