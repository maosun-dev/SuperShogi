// CPU 同士の対局を GitHub の計算機で同時に指し（.github/workflows/arena.yml）、結果を取り寄せて数える。
// 使い方：node tools/arena/cloud.mjs <mode@seed>... [--games 28] [--scale 1] [--commit <sha>]
//   例：node tools/arena/cloud.mjs pair:kabuki:shihan@43 pair:shihan:oni@41
// 結果は tools/arena/out/cloud-<run番号>/<mode>-<seed>.jsonl（1局1行。summary.mjs でも数えられる）
// ワークフローは main にあるものが動く。測るコードも push 済みである必要がある（--commit で古いコミットも測れる）
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = 'maosun-dev/SuperShogi';
const GH = existsSync('C:/Program Files/GitHub CLI/gh.exe') ? 'C:/Program Files/GitHub CLI/gh.exe' : 'gh';

const args = process.argv.slice(2);
const opt = { games: '28', scale: '1', commit: '' };
const matches = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else matches.push(a);
}
if (!matches.length) {
  console.log('使い方：node tools/arena/cloud.mjs <mode@seed>... [--games 28] [--scale 1] [--commit <sha>]');
  process.exit(1);
}

function gh(...a) {
  const r = spawnSync(GH, a, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh ${a.join(' ')}\n${r.stderr}`);
  return r.stdout.trim();
}

// 1. 動かす
const since = Date.now() - 5_000;
gh('workflow', 'run', 'arena.yml', '-R', REPO, '--ref', 'main',
  '-f', `matches=${matches.join(' ')}`, '-f', `games=${opt.games}`, '-f', `scale=${opt.scale}`, '-f', `commit=${opt.commit}`);

// 2. 動かした回の番号を探す（すぐには一覧に出ないので少し待つ）
let id = null;
for (let tries = 0; tries < 30 && !id; tries++) {
  await new Promise(r => setTimeout(r, 3_000));
  const runs = JSON.parse(gh('run', 'list', '-R', REPO, '-w', 'arena.yml', '-L', '5', '--json', 'databaseId,createdAt'));
  id = runs.find(r => Date.parse(r.createdAt) >= since)?.databaseId ?? null;
}
if (!id) throw new Error('動かした回が見つからない');
console.log(`動かした：https://github.com/${REPO}/actions/runs/${id}`);

// 3. 終わるまで待つ（ときどき進み具合を出す）
const started = Date.now();
for (;;) {
  const v = JSON.parse(gh('run', 'view', String(id), '-R', REPO, '--json', 'status,conclusion,jobs'));
  const plays = v.jobs.filter(j => j.name.startsWith('play'));
  const done = plays.filter(j => j.status === 'completed').length;
  console.log(`${Math.round((Date.now() - started) / 60_000)}分：計算機 ${done}/${plays.length} 台おわり`);
  if (v.status === 'completed') {
    if (v.conclusion !== 'success') console.log(`注意：結果が ${v.conclusion}（取れた分だけ数える）`);
    break;
  }
  await new Promise(r => setTimeout(r, 60_000));
}

// 4. 取り寄せて、組み合わせごとに1つのファイルにまとめる
const dir = join(here, 'out', `cloud-${id}`);
const raw = join(dir, 'raw');
mkdirSync(raw, { recursive: true });
gh('run', 'download', String(id), '-R', REPO, '-D', raw);
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(raw);
const merged = new Map();
for (const f of files) {
  const key = f.replace(/^.*[\\/]/, '').replace(/-j\d+\.jsonl$/, '');
  merged.set(key, (merged.get(key) ?? '') + readFileSync(f, 'utf8'));
}
rmSync(raw, { recursive: true });

// 5. 数える：pair:A:B は A の勝ち数
for (const [key, text] of merged) {
  const out = join(dir, `${key}.jsonl`);
  writeFileSync(out, text);
  const recs = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  const m = key.match(/^pair-([a-z]+)-([a-z]+)-\d+$/);
  if (!m) { console.log(`${key}：${recs.length} 局 → ${out}`); continue; }
  let w = 0, l = 0, d = 0;
  for (const r of recs) {
    if (r.winner === null) d++;
    else if (r[r.winner].level === m[1]) w++;
    else l++;
  }
  const pct = w + l ? Math.round((100 * w) / (w + l)) : 0;
  console.log(`${m[1]} → ${m[2]}：${recs.length} 局で ${w}勝${l}敗${d}分（${pct}%）→ ${out}`);
}
