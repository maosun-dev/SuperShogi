// 効果音。Web Audio で合成する（音のファイルは使わない）。
// 決まり：
// - AudioContext は最初の unlock()（最初の操作）で作る。作れない・失敗したときは何もしない
// - play は決して例外を出さない（音の失敗で演出を止めない）
// - 雑音のバッファは1つだけ作って使い回す。鳴らした部品は止める時刻を決めておき、自然に終わらせる
import { loadSettings, safeStore } from '../app/storage';

export type SoundName =
  | 'hyoshigi' | 'tick' | 'whoosh' | 'thunder' | 'shatter' | 'wind'
  | 'frost' | 'flip' | 'stamp' | 'clang' | 'chime' | 'drum';

export interface Sound {
  unlock(): void;
  play(name: SoundName, opts?: { gain?: number }): void;
  setVolume(v: number): void;
}

/** 音量つまみ（0〜1）→ 本当の大きさ。耳には2乗ぐらいがちょうどよい。範囲外・数でないものは丸める */
export function volumeToGain(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const c = Math.min(1, Math.max(0, v));
  return c * c;
}

type Ctx = AudioContext;

/** 部品を鳴らす道具（1つの AudioContext に結びつく） */
interface Kit {
  ctx: Ctx;
  out: AudioNode;
  noise: AudioBuffer;
}

function noiseBuffer(ctx: Ctx): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

interface NoiseOpt {
  at: number; dur: number; gain: number;
  type: BiquadFilterType; f0: number; f1?: number; q?: number;
  attack?: number; // 立ち上がり（秒）。なければすぐ最大
}

/** 雑音を、帯域（フィルタ）を絞って（f0→f1 へ動かして）鳴らし、dur 秒で消す */
function noiseBurst(k: Kit, o: NoiseOpt): void {
  const src = k.ctx.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  const f = k.ctx.createBiquadFilter();
  f.type = o.type;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.at + o.dur);
  const g = k.ctx.createGain();
  const a = o.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, o.at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), o.at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
  src.connect(f).connect(g).connect(k.out);
  // 雑音の頭の位置をばらして、鳴らすたびに少し違う音にする
  src.start(o.at, Math.random() * 1.5);
  src.stop(o.at + o.dur + 0.05);
}

/** 正弦波を鳴らす（f1 があれば音程が動く）。dur 秒で消える */
function tone(k: Kit, at: number, f0: number, dur: number, gain: number, f1?: number): void {
  const o = k.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), at + dur);
  const g = k.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(k.out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** 拍子木の1打：短い雑音を 2.2kHz で絞り、40ms で消す */
function clack(k: Kit, at: number, gain: number): void {
  noiseBurst(k, { at, dur: 0.04, gain, type: 'bandpass', f0: 2200, q: 5 });
}

type Recipe = (k: Kit, t: number, g: number) => void;

const RECIPES: Record<SoundName, Recipe> = {
  // 拍子木：2回、90ms 空けて
  hyoshigi: (k, t, g) => { clack(k, t, 0.9 * g); clack(k, t + 0.09, 0.9 * g); },
  // 駒の音：拍子木の1回を小さく
  tick: (k, t, g) => clack(k, t, 0.35 * g),
  // 雷：低域を残した雑音のうなり 1.6 秒。ごく低い正弦波で腹に響かせる
  thunder: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 1.6, gain: 1.0 * g, type: 'lowpass', f0: 520, f1: 90, q: 0.8, attack: 0.03 });
    tone(k, t, 55, 1.4, 0.5 * g, 38);
  },
  // 砕ける音：高い雑音の短い粒が不揃いに散る
  shatter: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.22, gain: 0.5 * g, type: 'highpass', f0: 3200, q: 0.7 });
    for (let i = 0; i < 6; i++) {
      noiseBurst(k, { at: t + 0.03 + Math.random() * 0.28, dur: 0.05, gain: (0.18 + Math.random() * 0.2) * g, type: 'bandpass', f0: 3000 + Math.random() * 4000, q: 6 });
    }
  },
  // 風：雑音の帯域を上から下へ
  wind: (k, t, g) => noiseBurst(k, { at: t, dur: 0.95, gain: 0.7 * g, type: 'bandpass', f0: 1800, f1: 300, q: 2.5, attack: 0.18 }),
  // 術：風より短く速い
  whoosh: (k, t, g) => noiseBurst(k, { at: t, dur: 0.55, gain: 0.7 * g, type: 'bandpass', f0: 2600, f1: 400, q: 3, attack: 0.1 }),
  // 霜：高い澄んだ音が3つ、ずれて鳴る
  frost: (k, t, g) => {
    [2637, 3520, 4186].forEach((f, i) => tone(k, t + i * 0.07, f, 0.7, 0.16 * g));
    noiseBurst(k, { at: t, dur: 0.3, gain: 0.2 * g, type: 'highpass', f0: 6500 });
  },
  // 札がめくれる：さっと擦れる音と、軽い打ち
  flip: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.12, gain: 0.5 * g, type: 'bandpass', f0: 1000, f1: 3000, q: 1.5 });
    tone(k, t + 0.1, 620, 0.1, 0.25 * g, 220);
  },
  // 判を押す：低い正弦波 90Hz の短い打撃
  stamp: (k, t, g) => {
    tone(k, t, 90, 0.28, 0.9 * g, 48);
    noiseBurst(k, { at: t, dur: 0.05, gain: 0.3 * g, type: 'lowpass', f0: 900 });
  },
  // 金属のぶつかり：倍音のずれた正弦波4つを 1.2 秒で消す
  clang: (k, t, g) => {
    for (const [f, a] of [[520, 0.4], [1310, 0.3], [1960, 0.22], [2910, 0.14]]) tone(k, t, f, 1.2, a * g);
    noiseBurst(k, { at: t, dur: 0.04, gain: 0.4 * g, type: 'bandpass', f0: 3500, q: 3 });
  },
  // 金の光：高い正弦波2つ
  chime: (k, t, g) => { tone(k, t, 1568, 0.9, 0.3 * g); tone(k, t + 0.08, 2349, 0.9, 0.22 * g); },
  // 太鼓：低い打ちを2つ（2つ目が大きい）
  drum: (k, t, g) => {
    tone(k, t, 110, 0.5, 0.7 * g, 55);
    noiseBurst(k, { at: t, dur: 0.18, gain: 0.35 * g, type: 'lowpass', f0: 400, f1: 120 });
    tone(k, t + 0.34, 90, 0.9, 1.0 * g, 42);
    noiseBurst(k, { at: t + 0.34, dur: 0.3, gain: 0.5 * g, type: 'lowpass', f0: 350, f1: 90 });
  },
};

const silent: Sound = { unlock() {}, play() {}, setVolume() {} };

function createSound(): Sound {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let kit: Kit | null = null;
  let failed = false;
  let volume = 0.7;
  try { volume = loadSettings(safeStore()).volume; } catch { /* 既定の音量のまま */ }

  return {
    unlock() {
      if (failed) return;
      try {
        if (!ctx) {
          const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
          const Ctor = g.AudioContext ?? g.webkitAudioContext;
          if (!Ctor) { failed = true; return; }
          ctx = new Ctor();
          master = ctx.createGain();
          master.gain.value = volumeToGain(volume);
          master.connect(ctx.destination);
          kit = { ctx, out: master, noise: noiseBuffer(ctx) };
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch (e) {
        failed = true;
        ctx = null; kit = null; master = null;
        console.error('音を使えませんでした', e);
      }
    },
    play(name, opts) {
      try {
        if (!ctx || !kit || failed) return;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
        RECIPES[name](kit, ctx.currentTime + 0.005, opts?.gain ?? 1);
      } catch (e) {
        console.error(`効果音に失敗しました（${name}）`, e);
      }
    },
    setVolume(v) {
      volume = v;
      try {
        if (master && ctx) master.gain.setTargetAtTime(volumeToGain(v), ctx.currentTime, 0.01);
      } catch { /* 音量が変えられなくても進める */ }
    },
  };
}

let instance: Sound | null = null;

/** 効果音の本体（1つだけ）。音が使えない環境では何もしない Sound になる */
export function getSound(): Sound {
  if (!instance) {
    try { instance = createSound(); } catch { instance = silent; }
  }
  return instance;
}
