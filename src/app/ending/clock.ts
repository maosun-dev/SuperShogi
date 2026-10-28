// エンディングの時計：曲の位置（秒）に合わせて場面を進める。裏から戻って曲が続きから流れれば、場面も続きから。
// 音が出せない・曲がまだ鳴っていないときは自分の時計で進む。時計は後ろへは戻らない
export interface ClockSource {
  musicTime(): number | null; // いま鳴っている曲の位置（秒）。鳴っていなければ null
  now(): number;              // ミリ秒
}

export function createEndingClock(src: ClockSource): { t(): number } {
  let last = 0;
  let lastNow = src.now();
  return {
    t() {
      const n = src.now();
      const m = src.musicTime();
      const v = m === null ? last + (n - lastNow) / 1000 : Math.max(m, last);
      last = v;
      lastNow = n;
      return v;
    },
  };
}
