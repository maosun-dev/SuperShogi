// 効果音。Web Audio で合成する。録った音（public/sfx）がある名前は、読み込めたらそちらを鳴らす（読めるまでは合成の音）。
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
  | 'reel' | 'armor' | 'chain' | 'hoof' | 'flame' | 'tsuke' | 'splash'
  | 'fude' | 'suzu' // 決着（筆の擦れる音・負けの書き終わりの鈴）
  | 'raimei' | 'rakurai' // 落雷のためる雷鳴・本命の一撃（2026-10-24 録った音）
  | 'kachi' | 'make'; // 決着の書き終わりの決め音（勝ち・負け）

export type MusicName = 'taikyoku' | 'sakura' | 'title';

/** 曲（public/bgm）。ループの位置は秒。gain は効果音に対する大きさ */
interface Track { path: string; loopStart: number; loopEnd: number; gain: number }

// 対局の曲（2026-10-24、SUNO）：元の曲は 32.010秒→68.875秒（88拍）をくり返す作り。
// ファイルは「頭〜68.875秒」＋「ループ区間の写し（頭15msを重ねてつないだもの）」＋「写しの頭0.5秒」に作り直してあり、
// 写しの中（68.875〜105.740秒）だけをくり返すと波形が切れ目なくつながる
// 対局の曲2「サクラドリフト」とタイトルの曲（2026-10-24、SUNO）：ファイルは「頭〜ループの終わり」＋「戻った先の続き0.5秒」。
// 終わりの手前60ms までに戻った先の音へ重ねて移してあるので、読み込みで位置が少しずれても切れ目が出ない。
// - サクラドリフト：150BPM。86.925秒〜189.327秒（256拍）をくり返す
// - タイトル：136BPM。くり返しのない通しの曲なので、最後の一打の余韻のあと頭へ戻す（0.1秒〜120拍＝30小節）
export const TRACKS: Record<MusicName, Track> = {
  taikyoku: { path: 'bgm/taikyoku.mp3', loopStart: 68.875, loopEnd: 105.74, gain: 0.5 },
  sakura: { path: 'bgm/sakura.mp3', loopStart: 86.925, loopEnd: 189.327, gain: 0.5 },
  title: { path: 'bgm/title.mp3', loopStart: 0.1, loopEnd: 0.1 + 120 * 60 / 136, gain: 0.45 },
};

/**
 * 録った効果音（public/sfx、SUNO の音を録画から切り出したもの・頭の山を -1dB にそろえてある）。
 * files が複数なら交互に鳴らす。jitter は鳴らすたびの高さの揺れ（±の割合）
 */
interface Sample { files: string[]; gain: number; jitter?: number }
export const SAMPLES: Partial<Record<SoundName, Sample>> = {
  koma: { files: ['sfx/koma1.mp3', 'sfx/koma2.mp3'], gain: 0.6, jitter: 0.04 },
  komaHard: { files: ['sfx/koma1.mp3', 'sfx/koma2.mp3'], gain: 0.85, jitter: 0.03 },
  slash: { files: ['sfx/slash.mp3'], gain: 0.8 },
  armor: { files: ['sfx/zankin.mp3'], gain: 0.6 },
  clang: { files: ['sfx/kenkin.mp3'], gain: 0.55 },
  raimei: { files: ['sfx/raimei.mp3'], gain: 0.8 },
  rakurai: { files: ['sfx/rakurai.mp3'], gain: 1 },
  kachi: { files: ['sfx/kachi.mp3'], gain: 0.8 },
  make: { files: ['sfx/make.mp3'], gain: 0.8 },
};

/** 曲のファイルの返事を使ってよいか。200番台か、番号のない返事（iPhone アプリ）で中身があるとき */
export function musicResponseUsable(status: number, bytes: number): boolean {
  if (bytes <= 0) return false;
  return status === 0 || (status >= 200 && status < 300);
}

export interface Sound {
  unlock(): void;
  play(name: SoundName, opts?: { gain?: number }): void;
  setVolume(v: number): void;
  /** 音が出せる状態か（AudioContext が running）。解錠のきっかけの登録を外してよいかの判断に使う */
  running(): boolean;
  /** 流す曲を決める（null で止める）。音が出せるようになるまでは待ち、出せるようになったら流す */
  music(name: MusicName | null): void;
  /** 裏へ回ったときに音を止める（戻ったら unlock で再開） */
  sleep(): void;
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
  // 筆が紙を擦る「サッ」：短く柔らかい雑音（一画ごと。小さめ）
  fude: (k, t, g) => {
    noiseBurst(k, { at: t, dur: 0.16, gain: 0.22 * g, type: 'bandpass', f0: 2200, f1: 1200, q: 1.2, attack: 0.03 });
  },
  // 鈴：低めの澄んだ響きが長く残る
  suzu: (k, t, g) => {
    tone(k, t, 784, 1.8, 0.22 * g);
    tone(k, t + 0.01, 1176, 1.4, 0.12 * g);
    tone(k, t + 0.02, 1965, 0.9, 0.06 * g);
  },
  // 録った音が読めないときの代わり
  raimei: (k, t, g) => BASE_RECIPES.thunder(k, t, 0.4 * g),
  rakurai: (k, t, g) => BASE_RECIPES.thunder(k, t, g),
  kachi: (k, t, g) => BASE_RECIPES.drum(k, t, g),
  make: (k, t, g) => CARD_RECIPES.suzu(k, t, g),
};
const RECIPES: Record<SoundName, Recipe> = { ...BASE_RECIPES, ...CARD_RECIPES };

/** 録った音に重ねる合成の音（強めのパチンの低い響き） */
const SAMPLE_EXTRA: Partial<Record<SoundName, Recipe>> = {
  komaHard: (k, t, g) => tone(k, t, 160, 0.16, 0.45 * g, 90),
};

const silent: Sound = { unlock() {}, play() {}, setVolume() {}, running: () => false, music() {}, sleep() {} };

const MUSIC_FADE_IN = 1.2; // 秒
const MUSIC_FADE_OUT = 0.25; // 時定数（秒）。約1秒で聞こえなくなる

function createSound(): Sound {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let kit: Kit | null = null;
  let failed = false;
  let volume = 0.7;
  try { volume = loadSettings(safeStore()).volume; } catch { /* 既定の音量のまま */ }

  // 曲：wanted＝流したい曲、playing＝いま鳴らしている曲。読み込みは1曲1回だけ
  let wanted: MusicName | null = null;
  let playing: { name: MusicName; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  const buffers = new Map<MusicName, Promise<AudioBuffer | null>>();

  /** 音のファイルを読んで AudioBuffer にする。読めなければ null */
  function fetchAudio(c: Ctx, path: string): Promise<AudioBuffer | null> {
    // iPhone アプリ（Capacitor）は mp3 を範囲の指定なしで頼むと番号のない返事（status 0）を返すので、
    // ファイル全体を範囲で頼んで 206 を受け取る。番号がなくても中身が届いていれば使う
    return fetch(`${import.meta.env.BASE_URL}${path}`, { headers: { Range: 'bytes=0-' } })
      .then(async (r) => {
        const b = await r.arrayBuffer();
        if (!musicResponseUsable(r.status, b.byteLength)) throw new Error(`読めませんでした（${r.status}・${b.byteLength}バイト）`);
        return b;
      })
      .then((b) => c.decodeAudioData(b))
      .catch((e: unknown) => { console.error(`音のファイルを使えませんでした（${path}）`, e); return null; });
  }

  function load(c: Ctx, name: MusicName): Promise<AudioBuffer | null> {
    let p = buffers.get(name);
    if (!p) {
      p = fetchAudio(c, TRACKS[name].path);
      buffers.set(name, p);
    }
    return p;
  }

  // 録った効果音：AudioContext を作ったら全部読み始める。読めたものから録った音に替わる
  const clips = new Map<string, AudioBuffer>();
  const turn = new Map<SoundName, number>(); // 交互に鳴らす番
  function loadSamples(c: Ctx): void {
    const paths = new Set(Object.values(SAMPLES).flatMap((s) => s.files));
    for (const path of paths) void fetchAudio(c, path).then((b) => { if (b && ctx === c) clips.set(path, b); });
  }

  /** 録った音を鳴らす。まだ読めていなければ false */
  function playSample(c: Ctx, out: AudioNode, name: SoundName, at: number, g: number): boolean {
    const s = SAMPLES[name];
    if (!s) return false;
    const n = turn.get(name) ?? 0;
    const buf = clips.get(s.files[n % s.files.length]);
    if (!buf) return false;
    turn.set(name, n + 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    if (s.jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * s.jitter;
    const gain = c.createGain();
    gain.gain.value = s.gain * g;
    src.connect(gain).connect(out);
    src.start(at);
    return true;
  }

  function stopMusic(): void {
    if (!playing || !ctx) return;
    const { src, gain } = playing;
    playing = null;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.setTargetAtTime(0, now, MUSIC_FADE_OUT);
      src.stop(now + MUSIC_FADE_OUT * 6);
    } catch { /* 止められなくても進める */ }
  }

  /** 流したい曲と鳴っている曲を合わせる。音が出せない間は何もしない（出せるようになったら呼び直される） */
  function syncMusic(): void {
    try {
      if (!ctx || !master || failed) return;
      if (playing && playing.name !== wanted) stopMusic();
      if (!wanted || playing || ctx.state !== 'running') return;
      const name = wanted;
      const c = ctx, out = master;
      void load(c, name).then((buf) => {
        try {
          // 読み終わるまでに曲が変わった・もう鳴っている・音が止まった なら流さない
          if (!buf || wanted !== name || playing || ctx !== c || c.state !== 'running') return;
          const t = TRACKS[name];
          const src = c.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.loopStart = t.loopStart;
          src.loopEnd = Math.min(t.loopEnd, buf.duration);
          const gain = c.createGain();
          const now = c.currentTime;
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(t.gain, now + MUSIC_FADE_IN);
          src.connect(gain).connect(out);
          src.start(now);
          playing = { name, src, gain };
        } catch (e) {
          console.error(`曲を流せませんでした（${name}）`, e);
        }
      });
    } catch (e) {
      console.error('曲の切り替えに失敗しました', e);
    }
  }

  return {
    music(name) {
      wanted = name;
      syncMusic();
    },
    sleep() {
      try { if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {}); } catch { /* 止められなくても進める */ }
    },
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
          loadSamples(ctx);
          // 音が出せるようになったら、待っていた曲を流す
          ctx.addEventListener('statechange', () => syncMusic());
        }
        // running 以外（suspended と、iOS の interrupted）はどちらも再開を試す
        if (ctx.state !== 'running') void ctx.resume().catch(() => {});
        else syncMusic();
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
        const at = ctx.currentTime + 0.005, g = opts?.gain ?? 1;
        if (playSample(ctx, kit.out, name, at, g)) SAMPLE_EXTRA[name]?.(kit, at, g);
        else RECIPES[name](kit, at, g);
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
