// エンディングの時計：曲の位置（秒）に合わせて場面を進める。裏から戻って曲が続きから流れれば、場面も続きから。
// 音が出せない・曲がまだ鳴っていないときは自分の時計で進む。時計は後ろへは戻らない。
// 自分の時計は1コマあたり STEP_MAX_MS までしか進めない（裏に回って止まっていた時間を足さない）。
// 曲が時計より前の位置から鳴り直したら、その差を覚えて足し続ける（止まらずに続きから進む。2026-10-28 見直し）
export interface ClockSource {
  musicTime(): number | null; // いま鳴っている曲の位置（秒）。鳴っていなければ null
  now(): number;              // ミリ秒
}

const STEP_MAX_MS = 100;

export function createEndingClock(src: ClockSource): { t(): number } {
  let last = 0;
  let lastNow = src.now();
  let bias = 0; // 曲の位置に足す秒（曲が時計より前から鳴り直したぶん）
  return {
    t() {
      const n = src.now();
      const m = src.musicTime();
      let v: number;
      if (m === null) {
        v = last + Math.min(Math.max(0, n - lastNow), STEP_MAX_MS) / 1000;
      } else {
        if (m + bias < last) bias = last - m;
        v = m + bias;
      }
      last = v;
      lastNow = n;
      return v;
    },
  };
}
