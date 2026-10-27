// 友と対局（Game Center）：合言葉と、Game Center の「同じ番号の人どうしだけつなぐ」番号（GKMatchRequest.playerGroup）。
// 世界中の人が同じ仕組みを使うので、近距離の合言葉（漢数字1つ）より長い「駒の名前＋の＋漢数字2つ」（567通り）
export const GC_PIECES: readonly string[] = ['歩兵', '香車', '桂馬', '銀将', '金将', '角行', '飛車'];
export const GC_DIGITS: readonly string[] = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)]!;

/** 合言葉（例「桂馬の三七」） */
export function makeGcCode(rng: () => number): string {
  return `${pick(GC_PIECES, rng)}の${pick(GC_DIGITS, rng)}${pick(GC_DIGITS, rng)}`;
}

/** 合言葉の通し番号（0〜566）と版の小さなハッシュ（0〜9999）から作る番号。版が違う人どうしはつながらない */
export function gcGroup(code: string, version: string): number {
  const [piece, digits = ''] = code.split('の');
  const p = GC_PIECES.indexOf(piece ?? '');
  const a = GC_DIGITS.indexOf(digits[0] ?? '');
  const b = GC_DIGITS.indexOf(digits[1] ?? '');
  const index = (p * 9 + a) * 9 + b;
  let hash = 0;
  for (const ch of version) hash = (hash * 31 + ch.charCodeAt(0)) % 10000;
  return hash * 1000 + index + 1; // 0 にならないよう 1 から
}
