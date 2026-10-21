// CPU 同士の対局を、いくつかの組に分けて同時に走らせ、1つのファイルにまとめる。
// 使い方：node tools/arena/run.mjs <mode> <games> <shards> <seed> <timeScale>
// 結果は tools/arena/out/<mode>-<seed>.jsonl（1局1行）。終わったら summary.mjs で数える
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [mode = 'levels', games = '30', shards = '7', seed = '1', scale = '0.1'] = process.argv.slice(2);
mkdirSync(join(here, 'out'), { recursive: true });
const outPath = join(here, 'out', `${mode.replaceAll(":", "-")}-${seed}.jsonl`);
const out = createWriteStream(outPath, { flags: 'a' });
let done = 0;
const started = Date.now();
const procs = [];
for (let i = 0; i < Number(shards); i++) {
  const p = spawn('npx', ['vite-node', join(here, 'arena.ts'), '--', mode, games, String(i), shards, seed, scale], {
    shell: true, cwd: join(here, '..', '..'),
  });
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    let k;
    while ((k = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, k).trim();
      buf = buf.slice(k + 1);
      if (!line.startsWith('{')) continue;
      out.write(line + '\n');
      done++;
      if (done % 10 === 0) console.log(`${done}/${games} 局（${Math.round((Date.now() - started) / 1000)}秒）`);
    }
  });
  p.stderr.on('data', (d) => process.stderr.write(d));
  procs.push(new Promise((r) => p.on('close', r)));
}
await Promise.all(procs);
out.end();
console.log(`おわり：${done} 局 → ${outPath}`);
