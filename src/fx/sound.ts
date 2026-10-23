// 効果音。Web Audio で合成する（音のファイルは使わない）。
// 決まり：
// - AudioContext は最初の unlock()（最初の操作）で作る。作れない・失敗したときは何もしない
// - play は決して例外を出さない（音の失敗で演出を止めない）
// - 雑音のバッファは1つだけ作って使い回す。鳴らした部品は止める時刻を決めておき、自然に終わらせる
import { loadSettings, safeStore } from '../app/storage';

export type SoundName =
  | 'hyoshigi' | 'tick' | 'whoosh' | 'thunder' | 'shatter' | 'wind'
  | 'frost' | 'flip' | 'stamp' | 'clang' | 'chime' | 'drum'
  | 'koma' | 'komaHard' | 'kaesu'
  | CardSoundName;

/** 札の演出の音（2026-10-23。すべて仮の音。docs/sound-wishlist.md におすすめの差し替え先） */
type CardSoundName =
  | 'ice' | 'trapdoor' | 'thud' | 'paper' | 'glass' | 'slash' | 'poof'
  | 'reel' | 'armor' | 'chain' | 'hoof' | 'flame' | 'tsuke' | 'splash';

export interface Sound {
  unlock(): void;
  play(name: SoundName, opts?: { gain?: number }): void;
  setVolume(v: number): void;
  /** 音が出せる状態か（AudioContext が running）。解錠のきっかけの登録を外してよいかの判断に使う */
  running(): boolean;
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

/** 駒を盤に打つ「パチン」：乾いた木の打撃と短い響き。鳴らすたびに高さを ±4% 揺らして機械っぽさを消す */
function pachin(k: Kit, t: number, g: number): void {
  const j = 1 + (Math.random() - 0.5) * 0.08;
  noiseBurst(k, { at: t, dur: 0.035, gain: 0.8 * g, type: 'bandpass', f0: 1800 * j, q: 4 });
  tone(k, t, 820 * j, 0.07, 0.25 * g, 600 * j);
}

const BASE_RECIPES: Record<Exclude<SoundName, CardSoundName>, Recipe> = {
  // 拍子木：2回、90ms 空けて
  hyoshigi: (k, t, g) => { clack(k, t, 0.9 * g); clack(k, t + 0.09, 0.9 * g); },
  // 駒を選ぶ音：拍子木の1回を小さく
  tick: (k, t, g) => clack(k, t, 0.35 * g),
  // 駒を打つ音（ふつうの手）
  koma: (k, t, g) => pachin(k, t, g),
  // 取る手・打つ手の強めの「パチン」：低い響きを足す
  komaHard: (k, t, g) => {
    pachin(k, t, 1.2 * g);
    tone(k, t, 160, 0.16, 0.45 * g, 90);
  },
  // 成りの裏返し「カッ」：高く短い
  kaesu: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.025, gain: 0.6 * g, type: 'bandpass', f0: 3200, q: 6 });
    tone(k, t, 1400, 0.05, 0.2 * g, 1100);
  },
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

// ---------- 札の演出の仮の音 ----------
const CARD_RECIPES: Record<CardSoundName, Recipe> = {
  // 氷が伸びる：高い雑音のバリバリが重なり、澄んだ短い響きで終わる
  ice: (k, t, g) => {
    for (let i = 0; i < 7; i++) {
      noiseBurst(k, { at: t + i * 0.045 + Math.random() * 0.02, dur: 0.06, gain: (0.25 + Math.random() * 0.2) * g, type: 'bandpass', f0: 4200 + Math.random() * 2500, q: 4 });
    }
    tone(k, t + 0.32, 3136, 0.5, 0.18 * g);
    tone(k, t + 0.36, 4699, 0.4, 0.1 * g);
  },
  // 床板が開く：木のきしみ（帯域の狭い雑音の上下）＋低いドン
  trapdoor: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.22, gain: 0.35 * g, type: 'bandpass', f0: 700, f1: 1300, q: 9, attack: 0.05 });
    tone(k, t + 0.16, 120, 0.3, 0.7 * g, 60);
    noiseBurst(k, { at: t + 0.16, dur: 0.12, gain: 0.35 * g, type: 'lowpass', f0: 800 });
  },
  // 低いドスン
  thud: (k, t, g) => {
    tone(k, t, 70, 0.45, 1.0 * g, 36);
    noiseBurst(k, { at: t, dur: 0.25, gain: 0.45 * g, type: 'lowpass', f0: 380, f1: 80 });
  },
  // お札が貼り付く：短い紙のこすれ＋ペタッ
  paper: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.1, gain: 0.35 * g, type: 'highpass', f0: 2500, attack: 0.03 });
    noiseBurst(k, { at: t + 0.1, dur: 0.04, gain: 0.6 * g, type: 'bandpass', f0: 900, q: 2 });
    tone(k, t + 0.1, 240, 0.08, 0.3 * g, 140);
  },
  // 割れる：高い雑音の割れ＋きらきらした響き
  glass: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.18, gain: 0.6 * g, type: 'highpass', f0: 3800, q: 0.8 });
    for (let i = 0; i < 6; i++) tone(k, t + 0.02 + i * 0.05, 2600 + Math.random() * 3200, 0.35, 0.08 * g);
  },
  // 斬撃：速い風切り＋金属の鋭い響き
  slash: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.18, gain: 0.8 * g, type: 'bandpass', f0: 5000, f1: 900, q: 2, attack: 0.04 });
    tone(k, t + 0.12, 2400, 0.7, 0.18 * g);
    tone(k, t + 0.12, 3600, 0.5, 0.1 * g);
  },
  // 煙玉：柔らかい雑音のボン
  poof: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.45, gain: 0.8 * g, type: 'lowpass', f0: 1400, f1: 200, attack: 0.01 });
    tone(k, t, 140, 0.2, 0.4 * g, 70);
  },
  // 釣り糸のリール：細かいカリカリ
  reel: (k, t, g) => {
    for (let i = 0; i < 12; i++) noiseBurst(k, { at: t + i * 0.035, dur: 0.012, gain: 0.3 * g, type: 'bandpass', f0: 3800, q: 8 });
  },
  // 鎧がはまる・弾く：clang より厚い金属のガシャン
  armor: (k, t, g) => {
    for (const [f, a] of [[310, 0.45], [720, 0.35], [1180, 0.25], [1720, 0.16]]) tone(k, t, f, 0.6, a * g);
    noiseBurst(k, { at: t, dur: 0.12, gain: 0.6 * g, type: 'bandpass', f0: 2200, q: 1.2 });
  },
  // 鎖：金属の細かいジャラジャラ
  chain: (k, t, g) => {
    for (let i = 0; i < 10; i++) {
      const at = t + i * 0.04 + Math.random() * 0.02;
      tone(k, at, 2200 + Math.random() * 1800, 0.08, 0.1 * g);
      noiseBurst(k, { at, dur: 0.02, gain: 0.2 * g, type: 'bandpass', f0: 4000, q: 5 });
    }
  },
  // 蹄：乾いたカッカッ
  hoof: (k, t, g) => {
    for (const d of [0, 0.12]) {
      noiseBurst(k, { at: t + d, dur: 0.03, gain: 0.7 * g, type: 'bandpass', f0: 1300, q: 5 });
      tone(k, t + d, 480, 0.05, 0.25 * g, 300);
    }
  },
  // 炎：低いゴオッ
  flame: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.8, gain: 0.7 * g, type: 'lowpass', f0: 300, f1: 900, q: 1.5, attack: 0.15 });
    noiseBurst(k, { at: t + 0.1, dur: 0.6, gain: 0.25 * g, type: 'bandpass', f0: 1800, q: 0.8, attack: 0.1 });
  },
  // 水鏡に札が落ちる「ちゃぽん」：音程の下がる丸い響き＋細かい水しぶき
  splash: (k, t, g) => {
    tone(k, t, 900, 0.18, 0.35 * g, 300);
    tone(k, t + 0.05, 520, 0.4, 0.2 * g, 380);
    noiseBurst(k, { at: t, dur: 0.35, gain: 0.3 * g, type: 'bandpass', f0: 2500, f1: 900, q: 1.2 });
  },
  // ツケ打ち：板を打つバタバタッ（3打、最後が強い）
  tsuke: (k, t, g) => {
    [0, 0.09, 0.16].forEach((d, i) => {
      noiseBurst(k, { at: t + d, dur: 0.05, gain: (0.6 + i * 0.2) * g, type: 'bandpass', f0: 1500, q: 3 });
      tone(k, t + d, 200, 0.08, (0.4 + i * 0.15) * g, 120);
    });
  },
};
const RECIPES: Record<SoundName, Recipe> = { ...BASE_RECIPES, ...CARD_RECIPES };

const silent: Sound = { unlock() {}, play() {}, setVolume() {}, running: () => false };

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
        // running 以外（suspended と、iOS の interrupted）はどちらも再開を試す
        if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      } catch (e) {
        failed = true;
        ctx = null; kit = null; master = null;
        console.error('音を使えませんでした', e);
      }
    },
    play(name, opts) {
      try {
        if (!ctx || !kit || failed) return;
        // 音が出せない間は再開だけ試し、音は予約せず捨てる（解錠の瞬間に溜まった音が一斉に鳴らないように）
        if (ctx.state !== 'running') { void ctx.resume().catch(() => {}); return; }
        RECIPES[name](kit, ctx.currentTime + 0.005, opts?.gain ?? 1);
      } catch (e) {
        console.error(`効果音に失敗しました（${name}）`, e);
      }
    },
    running: () => ctx !== null && ctx.state === 'running',
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
