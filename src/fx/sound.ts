// 効果音。Web Audio で合成する。録った音（public/sfx）がある名前は、読み込めたらそちらを鳴らす（読めるまでは合成の音）。
// 決まり：
// - AudioContext は最初の unlock()（最初の操作）で作る。作れない・失敗したときは何もしない
// - play は決して例外を出さない（音の失敗で演出を止めない）
// - 雑音のバッファは1つだけ作って使い回す。鳴らした部品は止める時刻を決めておき、自然に終わらせる
import { soundLog } from './soundLog';
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
  | 'kachi' | 'make' // 決着の書き終わりの決め音（勝ち・負け）
  | 'tekkyu' | 'inanaki' | 'maku' // 鉄球が落ちる・天馬のいななき・結果画面への幕（2026-10-25 録った音）
  | 'levelup' | 'anaThud' | 'fuuin' // 成り上がり・落とし穴の底・成り封じの封印（同）
  | 'cardOut' // 札が盤の上に大きく出る（カードのシャッフルのはじき）
  | 'bubble' | 'kirakira' // 水鏡で札が沈む泡・札の力が宿る（格落とし・呼び戻し）
  | 'kotsuzumi' | 'flameShort' // カットイン（札の名前）の小鼓・韋駄天の短い炎
  | 'shakuhachi' // 対局の始まりの「開戦」
  | 'ote' // 王手
  // 王を取る・取られる演出（2026-10-25 仮の3案。素材の音）
  | 'bakuhatsu' | 'bakuhatsu2' | 'iai' | 'daiken' | 'naguru' | 'slowWhoosh' | 'slowmo'
  | 'uchitottari'; // 大見得の声「傾奇者、討ち取ったりー」（2026-10-28 持ち主が録った声）

export type MusicName = 'taikyoku' | 'taikyoku2' | 'sakura' | 'title';

/** 曲（public/bgm）。ループの位置は秒。gain は効果音に対する大きさ */
interface Track { path: string; loopStart: number; loopEnd: number; gain: number }

// 対局の曲（2026-10-24、SUNO）：元の曲は 32.010秒→68.875秒（88拍）をくり返す作り。
// ファイルは「頭〜68.875秒」＋「ループ区間の写し（頭15msを重ねてつないだもの）」＋「写しの頭0.5秒」に作り直してあり、
// 写しの中（68.875〜105.740秒）だけをくり返すと波形が切れ目なくつながる
// 対局の曲2「サクラドリフト」とタイトルの曲（2026-10-24、SUNO）：ファイルは「頭〜ループの終わり」＋「戻った先の続き0.5秒」。
// 終わりの手前60ms までに戻った先の音へ重ねて移してあるので、読み込みで位置が少しずれても切れ目が出ない。
// - サクラドリフト：150BPM。86.925秒〜189.327秒（256拍）をくり返す
// - 対局BGM2（2026-10-25）：143BPM。頭の1拍は前ふり。最後の一打（153拍目）の瞬間に1小節目の頭（1拍目）へ戻す（38小節）。
//   打ちが拍の格子から±40ms 揺れるので、格子でなく実際の打ちの手前で切る（0.520秒〜64.254秒）
// - タイトル：136BPM。くり返しのない通しの曲なので、最後の一打の余韻のあと頭へ戻す（0.1秒〜120拍＝30小節）
export const TRACKS: Record<MusicName, Track> = {
  taikyoku: { path: 'bgm/taikyoku.mp3', loopStart: 68.875, loopEnd: 105.74, gain: 0.5 },
  taikyoku2: { path: 'bgm/taikyoku2.mp3', loopStart: 0.52, loopEnd: 64.254, gain: 0.5 },
  sakura: { path: 'bgm/sakura.mp3', loopStart: 86.925, loopEnd: 189.327, gain: 0.5 },
  title: { path: 'bgm/title.mp3', loopStart: 0.1, loopEnd: 0.1 + 120 * 60 / 136, gain: 0.45 },
};

/**
 * 録った効果音（public/sfx、SUNO の音を録画から切り出したもの・頭の山を -1dB にそろえてある）。
 * files が複数なら交互に鳴らす。jitter は鳴らすたびの高さの揺れ（±の割合）。repeat は同じ音を重ねて鳴らす時刻（秒）
 */
interface Sample { files: string[]; gain: number; jitter?: number; repeat?: number[] }
export const SAMPLES: Partial<Record<SoundName, Sample>> = {
  koma: { files: ['sfx/koma1.mp3', 'sfx/koma2.mp3'], gain: 0.6, jitter: 0.04 },
  komaHard: { files: ['sfx/koma1.mp3', 'sfx/koma2.mp3'], gain: 0.85, jitter: 0.03 },
  slash: { files: ['sfx/slash.mp3'], gain: 0.8 },
  armor: { files: ['sfx/zankin.mp3'], gain: 0.6 },
  clang: { files: ['sfx/kenkin.mp3'], gain: 0.55 },
  raimei: { files: ['sfx/raimei.mp3'], gain: 0.8 },
  rakurai: { files: ['sfx/rakurai.mp3'], gain: 1 },
  kachi: { files: ['sfx/kachi.mp3'], gain: 0.8 },
  make: { files: ['sfx/make.mp3'], gain: 0.5 }, // 0.8 は大きいとユーザー（2026-10-24）
  // 2026-10-25 録った音（SUNO の「効果音」の一覧を iPhone で画面ごと録ったもの）
  hyoshigi: { files: ['sfx/hyoshigi.mp3'], gain: 0.75, jitter: 0.02, repeat: [0, 0.11] }, // 1打を2回「カン、カン」
  tick: { files: ['sfx/tick.mp3'], gain: 0.3, jitter: 0.04 },
  kaesu: { files: ['sfx/kaesu.mp3'], gain: 0.7, jitter: 0.03 },
  drum: { files: ['sfx/drum.mp3'], gain: 0.8 },
  fude: { files: ['sfx/fude1.mp3', 'sfx/fude2.mp3', 'sfx/fude3.mp3'], gain: 0.35, jitter: 0.08 }, // 紙のこすれ（カードの音から）
  poof: { files: ['sfx/poof1.mp3', 'sfx/poof2.mp3'], gain: 0.7 },
  ice: { files: ['sfx/ice.mp3'], gain: 1 }, // 氷のぱちぱち→パキーン→木が砕ける打ち を重ねたもの
  frost: { files: ['sfx/frost.mp3'], gain: 0.5 },
  shatter: { files: ['sfx/shatter.mp3'], gain: 0.6 },
  chain: { files: ['sfx/chain.mp3'], gain: 0.7 }, // 鎖の音を高さを変えて3回重ねたもの
  trapdoor: { files: ['sfx/trapdoor.mp3'], gain: 0.9 }, // 扉を閉める音＋扉の低い音
  flip: { files: ['sfx/flip.mp3'], gain: 0.5, jitter: 0.04 },
  tekkyu: { files: ['sfx/tekkyu.mp3'], gain: 0.7 },
  inanaki: { files: ['sfx/inanaki.mp3'], gain: 0.55 },
  whoosh: { files: ['sfx/whoosh1.mp3', 'sfx/whoosh2.mp3'], gain: 0.5, jitter: 0.06 }, // 斬撃・剣撃のヒュッ
  levelup: { files: ['sfx/levelup.mp3'], gain: 0.7 },
  anaThud: { files: ['sfx/anaThud.mp3'], gain: 0.8 }, // 鉄球の2回目の録音
  fuuin: { files: ['sfx/fuuin.mp3'], gain: 0.8 }, // 大太鼓の重い一打＋パキーンのきらめき
  cardOut: { files: ['sfx/card1.mp3', 'sfx/card2.mp3'], gain: 0.6, jitter: 0.03 }, // カードを切る「しゃっしゃっ」（シャッフルの長い録音から2回続く所）
  thud: { files: ['sfx/anaThud.mp3'], gain: 0.8 }, // 落とし穴の底と同じ音（ユーザーが選んだ、2026-10-25）
  // 2026-10-25 フリー素材（効果音ラボ・On-Jin ～音人～）。public/sfx/lic は公開のリポジトリに入れない（再配布の禁止）。
  // 鍵をかけた tools/sfx/sfx-lic.locked を置き、組み立てのときに戻す。ここの音を足し替えたら npm run sfx:lock
  tsuke: { files: ['sfx/lic/tsuke.mp3'], gain: 0.7 }, // 拍子木の1打を3回重ねた「バタバタッ」
  hoof: { files: ['sfx/lic/hoof.mp3'], gain: 0.5, jitter: 0.04 }, // 馬の駆け足から蹄3打のまとまり
  bubble: { files: ['sfx/lic/bubble.mp3'], gain: 0.5 }, // 水中の泡
  reel: { files: ['sfx/lic/koto.mp3'], gain: 0.5 }, // 琴の滑奏
  suzu: { files: ['sfx/lic/rin.mp3'], gain: 0.8 }, // りん「チーン」（引き分けの書き終わり）
  kirakira: { files: ['sfx/lic/kirakira.mp3'], gain: 0.6 },
  wind: { files: ['sfx/lic/kaze.mp3'], gain: 0.8 }, // 風魔法
  flame: { files: ['sfx/lic/kaen.mp3'], gain: 0.6 }, // 火炎魔法（1.0 はくどくて大きいとユーザー）
  flameShort: { files: ['sfx/lic/kaen-short.mp3'], gain: 0.45 }, // 火炎魔法の頭1秒（韋駄天が戻る・歩くとき）
  maku: { files: ['sfx/lic/maku.mp3'], gain: 0.6 }, // 拍子木2「キキン」（長い刻みは長すぎるとユーザー）
  shakuhachi: { files: ['sfx/lic/shakuhachi.mp3'], gain: 0.4 }, // 尺八の頭1.6秒（0.6 は大きいとユーザー）
  ote: { files: ['sfx/lic/ote.mp3'], gain: 0.7 }, // 拍子木1を低く太く（王手）
  glass: { files: ['sfx/lic/wareru.mp3'], gain: 0.6 }, // 金属の打撃＋きらきら（格落としで成り字が割れる）
  kotsuzumi: { files: ['sfx/lic/kotsuzumi.mp3'], gain: 0.5 }, // 小鼓「ポン」（大きいとユーザー。高くした案は戻した）
  // 王を取る演出（仮の3案・2026-10-25。大きさは推測）
  bakuhatsu: { files: ['sfx/lic/bakuhatsu1.mp3'], gain: 0.7 }, // 爆発1（大花火）
  bakuhatsu2: { files: ['sfx/lic/bakuhatsu2.mp3'], gain: 0.6 }, // 爆発2
  iai: { files: ['sfx/lic/iai.mp3'], gain: 0.8 }, // 居合抜き
  daiken: { files: ['sfx/lic/daiken.mp3'], gain: 0.7 }, // 大剣で斬る
  naguru: { files: ['sfx/lic/naguru.mp3'], gain: 0.8 }, // ロボットを強く殴る（叩き割りの一撃）
  slowWhoosh: { files: ['sfx/lic/slowWhoosh.mp3'], gain: 0.7 }, // パンチの風切り音（スロー）
  slowmo: { files: ['sfx/lic/slowmo.mp3'], gain: 0.6 }, // スローモーション（頭2.6秒）
  // 持ち主の声。「傾奇者」を0.82倍に伸ばして少し響かせ、間を詰め、「討ち取ったりー」は響き＋山びこ（エコー）。音圧を上げた（約4.1秒。ffmpeg で整えた）
  uchitottari: { files: ['sfx/uchitottari.mp3'], gain: 1 },
};

/** 曲のファイルの返事を使ってよいか。200番台か、番号のない返事（iPhone アプリ）で中身があるとき */
export function musicResponseUsable(status: number, bytes: number): boolean {
  if (bytes <= 0) return false;
  return status === 0 || (status >= 200 && status < 300);
}

/** 曲のいまの位置（秒）。offset から始めて elapsed 秒流れた。くり返しの終わりを過ぎたら、くり返しの頭へ戻って数える */
export function musicPosition(offset: number, elapsed: number, loopStart: number, loopEnd: number): number {
  const p = offset + elapsed;
  const len = loopEnd - loopStart;
  if (!Number.isFinite(p) || p < 0 || !(len > 0)) return 0;
  return p < loopEnd ? p : loopStart + ((p - loopStart) % len);
}

export interface Sound {
  unlock(): void;
  play(name: SoundName, opts?: { gain?: number }): void;
  setVolume(v: number): void;
  /** 音が出せる状態か（AudioContext が running）。解錠のきっかけの登録を外してよいかの判断に使う */
  running(): boolean;
  /** 流す曲を決める（null で止める）。音が出せるようになるまでは待ち、出せるようになったら流す */
  music(name: MusicName | null): void;
  /** いま鳴っている曲 name の位置（秒）。その曲が鳴っていなければ null（エンディングの場面を曲に合わせる） */
  musicTime(name: MusicName): number | null;
  /** 裏へ回ったときに音を止める（音の仕組みを捨てる。戻ったら unlock で作り直す） */
  sleep(): void;
  /** 調べる用：音の仕組みの状態と時計（例「running t=12.34」）。時計が進まなければ固まっている */
  state(): string;
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
  tekkyu: (k, t, g) => { CARD_RECIPES.thud(k, t, g); BASE_RECIPES.drum(k, t, 0.6 * g); },
  inanaki: () => {}, // 合成の代わりはない（読めなければ鳴らさない）
  maku: (k, t, g) => BASE_RECIPES.hyoshigi(k, t, g),
  levelup: () => {}, // 合成の鈴は「システム音みたい」と不評なので、読めなければ鳴らさない
  cardOut: (k, t, g) => BASE_RECIPES.flip(k, t, g),
  anaThud: (k, t, g) => CARD_RECIPES.thud(k, t, g),
  fuuin: (k, t, g) => CARD_RECIPES.paper(k, t, g),
  bubble: () => {}, // 合成の代わりはない
  kirakira: () => {}, // 合成の鈴は不評なので、読めなければ鳴らさない
  kotsuzumi: (k, t, g) => BASE_RECIPES.hyoshigi(k, t, g),
  flameShort: (k, t, g) => CARD_RECIPES.flame(k, t, 0.6 * g),
  shakuhachi: () => {}, // 合成の代わりはない
  ote: (k, t, g) => BASE_RECIPES.hyoshigi(k, t, g),
  bakuhatsu: (k, t, g) => BASE_RECIPES.thunder(k, t, g),
  bakuhatsu2: (k, t, g) => BASE_RECIPES.thunder(k, t, 0.7 * g),
  iai: (k, t, g) => BASE_RECIPES.whoosh(k, t, g),
  daiken: (k, t, g) => CARD_RECIPES.slash(k, t, g),
  naguru: (k, t, g) => BASE_RECIPES.drum(k, t, g),
  slowWhoosh: (k, t, g) => BASE_RECIPES.whoosh(k, t, 0.6 * g),
  slowmo: () => {}, // 合成の代わりはない
  uchitottari: () => {}, // 声の代わりはない
};
const RECIPES: Record<SoundName, Recipe> = { ...BASE_RECIPES, ...CARD_RECIPES };

/** 録った音に重ねる合成の音（強めのパチンの低い響き） */
const SAMPLE_EXTRA: Partial<Record<SoundName, Recipe>> = {
  komaHard: (k, t, g) => tone(k, t, 160, 0.16, 0.45 * g, 90),
};

const silent: Sound = { unlock() {}, play() {}, setVolume() {}, running: () => false, music() {}, musicTime: () => null, sleep() {}, state: () => '音なし' };

const MUSIC_FADE_IN = 1.2; // 秒
const MUSIC_FADE_OUT = 0.25; // 時定数（秒）。約1秒で聞こえなくなる

export function createSound(): Sound {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let kit: Kit | null = null;
  let failed = false;
  let volume = 0.7;
  try { volume = loadSettings(safeStore()).volume; } catch { /* 既定の音量のまま */ }

  // 曲：wanted＝流したい曲、playing＝いま鳴らしている曲。読み込みは1曲1回だけ
  let wanted: MusicName | null = null;
  let playing: { name: MusicName; src: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number } | null = null;
  // 裏に回って止めたときの曲と位置。戻って同じ曲を流すときは、そこから続ける
  let resumeAt: { name: MusicName; pos: number } | null = null;
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
    for (const path of paths) {
      if (clips.has(path)) continue; // 作り直したときは読んだ音を使い回す
      void fetchAudio(c, path).then((b) => { if (b && ctx === c) clips.set(path, b); });
    }
  }

  /** 録った音を鳴らす。まだ読めていなければ false */
  function playSample(c: Ctx, out: AudioNode, name: SoundName, at: number, g: number): boolean {
    const s = SAMPLES[name];
    if (!s) return false;
    const n = turn.get(name) ?? 0;
    const buf = clips.get(s.files[n % s.files.length]);
    if (!buf) return false;
    turn.set(name, n + 1);
    const gain = c.createGain();
    gain.gain.value = s.gain * g;
    gain.connect(out);
    for (const d of s.repeat ?? [0]) {
      const src = c.createBufferSource();
      src.buffer = buf;
      if (s.jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * s.jitter;
      src.connect(gain);
      src.start(at + d);
    }
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
          const offset = resumeAt?.name === name && resumeAt.pos < buf.duration ? resumeAt.pos : 0;
          resumeAt = null;
          src.start(now, offset);
          soundLog(`曲 ${name} ${offset.toFixed(1)}秒から`);
          playing = { name, src, gain, startedAt: now, offset };
        } catch (e) {
          console.error(`曲を流せませんでした（${name}）`, e);
        }
      });
    } catch (e) {
      console.error('曲の切り替えに失敗しました', e);
    }
  }

  /** 再開を試す。うまくいったか・断られたかを記録に残す */
  function tryResume(c: Ctx, why: string): void {
    soundLog(`再開を試す(${why}) ${c.state}`);
    void c.resume()
      .then(() => soundLog(`再開できた ${c.state}`))
      .catch((e: unknown) => soundLog(`再開できない ${e instanceof Error ? e.name : String(e)}`));
  }

  return {
    music(name) {
      wanted = name;
      syncMusic();
    },
    musicTime(name) {
      if (!playing || !ctx || playing.name !== name) return null;
      const { src, startedAt, offset } = playing;
      return musicPosition(offset, ctx.currentTime - startedAt, src.loopStart, src.loopEnd);
    },
    sleep() {
      // iPhone のアプリは裏から戻ると AudioContext が固まり、触っても音が戻らないことがある（2026-10-26）。
      // 止めるだけでなく閉じて捨て、戻ったら unlock で作り直す。読んだ音は使い回す。
      // 曲は止めた位置を覚えておき、戻ったら続きから流す
      const c = ctx;
      soundLog(`止める ${c ? c.state : '仕組みなし'}`);
      if (!c) return;
      if (playing) {
        const { name, src, startedAt, offset } = playing;
        resumeAt = { name, pos: musicPosition(offset, c.currentTime - startedAt, src.loopStart, src.loopEnd) };
      }
      ctx = null; kit = null; master = null; playing = null;
      try { void c.close().catch(() => {}); } catch { /* 閉じられなくても進める */ }
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
          const made = ctx;
          made.addEventListener('statechange', () => { soundLog(`状態 ${made.state}`); syncMusic(); });
          soundLog(`作る ${made.state}`);
        }
        // running 以外（suspended と、iOS の interrupted）はどちらも再開を試す
        if (ctx.state !== 'running') tryResume(ctx, '解錠');
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
        if (ctx.state !== 'running') { soundLog(`鳴らせない ${ctx.state}`); tryResume(ctx, '鳴らす'); return; }
        const at = ctx.currentTime + 0.005, g = opts?.gain ?? 1;
        if (playSample(ctx, kit.out, name, at, g)) SAMPLE_EXTRA[name]?.(kit, at, g);
        else RECIPES[name](kit, at, g);
      } catch (e) {
        console.error(`効果音に失敗しました（${name}）`, e);
      }
    },
    running: () => ctx !== null && ctx.state === 'running',
    state: () => (ctx ? `${ctx.state} t=${ctx.currentTime.toFixed(2)}` : '仕組みなし'),
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
