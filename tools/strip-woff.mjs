// 組み立て後の dist/assets から、.woff の読み込み（CSS）と .woff ファイルを取り除く。
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripWoff } from '../src/app/fonts.ts';

const dir = 'dist/assets';
let cssCount = 0;
let woffCount = 0;
for (const name of readdirSync(dir)) {
  const path = join(dir, name);
  if (name.endsWith('.css')) {
    const before = readFileSync(path, 'utf8');
    const after = stripWoff(before);
    if (after !== before) writeFileSync(path, after);
    cssCount++;
  } else if (name.endsWith('.woff')) {
    rmSync(path);
    woffCount++;
  }
}
console.log(`strip-woff: css ${cssCount} 件を処理、.woff ${woffCount} 件を削除`);
