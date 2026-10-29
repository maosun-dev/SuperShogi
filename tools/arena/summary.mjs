// 対局の記録（jsonl）を数える：強さどうしの勝率・引き分けの割合・1手の時間、札ごとの「入れた側の勝率」
// 使い方：node tools/arena/summary.mjs <ファイル>...
import { readFileSync } from 'node:fs';

const recs = process.argv.slice(2).flatMap((f) =>
  readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)));
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
console.log(`対局 ${recs.length}`);
const draws = recs.filter((r) => r.winner === null).length;
console.log(`引き分け ${draws}（${pct(draws, recs.length)}）  平均手数 ${(recs.reduce((n, r) => n + r.plies, 0) / Math.max(1, recs.length)).toFixed(0)}`);

// 強さどうし（弱い順）
const ORDER = ['weak', 'normal', 'strong', 'oni', 'shihan', 'kabuki'];
const pairs = new Map();
for (const r of recs) {
  if (r.mode === 'cards') continue;
  const a = r.sente.level, b = r.gote.level;
  const [lo, hi] = ORDER.indexOf(a) < ORDER.indexOf(b) ? [a, b] : [b, a];
  const key = `${hi} 対 ${lo}`;
  const e = pairs.get(key) ?? { n: 0, hiWin: 0, draw: 0 };
  e.n++;
  if (r.winner === null) e.draw++;
  else if (r[r.winner].level === hi) e.hiWin++;
  pairs.set(key, e);
}
for (const [k, e] of pairs) console.log(`${k}：強い方の勝ち ${pct(e.hiWin, e.n)}（${e.hiWin}/${e.n}、引き分け ${e.draw}）`);

// 1手の時間（強さごと）
const t = new Map();
for (const r of recs) for (const side of ['sente', 'gote']) {
  const lv = r[side].level;
  const e = t.get(lv) ?? { max: 0, sum: 0, n: 0 };
  e.max = Math.max(e.max, r.maxMs[side]); e.sum += r.avgMs[side]; e.n++;
  t.set(lv, e);
}
for (const [lv, e] of t) console.log(`時間 ${lv}：平均 ${Math.round(e.sum / e.n)}ms、最大 ${e.max}ms`);

// 札ごとの「入れた側の勝率」（引き分けは半分の勝ちとして数える）。使った回数も
const cards = new Map();
for (const r of recs) {
  if (r.mode !== 'cards') continue;
  for (const side of ['sente', 'gote']) {
    const score = r.winner === null ? 0.5 : r.winner === side ? 1 : 0;
    for (const id of new Set(r[side].deck)) {
      const e = cards.get(id) ?? { n: 0, w: 0, used: 0 };
      e.n++; e.w += score;
      cards.set(id, e);
    }
    for (const id of r.cardsUsed[side]) {
      const e = cards.get(id) ?? { n: 0, w: 0, used: 0 };
      e.used++;
      cards.set(id, e);
    }
  }
}
const rows = [...cards].sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n);
for (const [id, e] of rows) console.log(`札 ${id.padEnd(12)} 勝率 ${pct(e.w, e.n).padStart(6)}（${e.n}局、使った ${e.used}回）`);
