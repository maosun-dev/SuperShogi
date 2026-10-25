// ブラウザ版を開発者サイト（maosun-dev.github.io）の kabukishogi/ へ写す。npm run web から呼ぶ（組み立てはその前に済んでいる）。
// 前の版の組み立て物（名前に番号の付いた assets など）が残らないよう、写す前に中身を消す。
// サイトのほうで書いたページ（プライバシーポリシー）だけは残す。サイトへの push は自分でする。
// 使い方：node tools/web/publish.mjs [写し先のフォルダ]
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DEST = process.argv[2] || '../maosun-dev.github.io/kabukishogi';
const KEEP = ['privacy.html'];

if (!existsSync(join(DEST, '..', 'CNAME'))) {
  console.error(`写し先がサイトのフォルダに見えません：${DEST}`);
  process.exit(1);
}
for (const name of readdirSync(DEST)) {
  if (!KEEP.includes(name)) rmSync(join(DEST, name), { recursive: true, force: true });
}
cpSync('dist', DEST, { recursive: true });
cpSync('tools/web/ogp.png', join(DEST, 'ogp.png'));
console.log(`写しました：${DEST}`);
