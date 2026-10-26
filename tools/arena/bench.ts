// CPU の読みの速さを測る道具（パソコンで動かす。アプリには入れない）。
// 決まった局面集（tests/ai/helpers/positions.ts）で、アプリと同じ chooseCpuAction を本番の時間で走らせ、
// 強さごとに「1秒あたりの局面数」「読めた深さ」「1手の局面数」「1手のいちばん長い時間」を出す。
// 使い方：npx vite-node tools/arena/bench.ts -- [強さ...]（省くと weak normal strong）
//         --nocap を付けると読む量の上限（maxNodes）を外して測る
import { chooseCpuAction, LEVELS, type Level } from '../../src/ai/levels';
import { benchPositions } from '../../tests/ai/helpers/positions';

const args = process.argv.slice(2).filter((a) => a !== '--');
const nocap = args.includes('--nocap');
const levels = (args.filter((a) => a !== '--nocap') as Level[]);
const targets: Level[] = levels.length > 0 ? levels : ['weak', 'normal', 'strong'];
const median = (xs: number[]): number => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length === 0 ? 0 : v[Math.floor(v.length / 2)];
};

const positions = benchPositions();
for (const level of targets) {
  const saved = LEVELS[level].maxNodes;
  if (nocap) LEVELS[level].maxNodes = undefined;
  const rates: number[] = [];
  const nodes: number[] = [];
  const depths = new Map<number, number>();
  let worst = 0;
  positions.forEach((s, i) => {
    const t0 = performance.now();
    const r = chooseCpuAction(s, s.turn, level, i + 1);
    const ms = performance.now() - t0;
    worst = Math.max(worst, ms);
    if (r.nodes > 0) { rates.push((r.nodes / ms) * 1000); nodes.push(r.nodes); }
    depths.set(r.depth, (depths.get(r.depth) ?? 0) + 1);
  });
  LEVELS[level].maxNodes = saved;
  const d = [...depths].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}手:${n}`).join(' ');
  console.log(`${level}${nocap ? '（上限なし）' : ''}：1秒あたり ${Math.round(median(rates))} 局面／読めた深さ ${d}／1手の局面数の中央値 ${median(nodes)}／いちばん長い ${Math.round(worst)}ms`);
}
