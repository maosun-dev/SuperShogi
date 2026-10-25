// フリー素材の効果音（public/sfx/lic）に鍵をかけてリポジトリに置く・組み立てのときに戻す。
// 効果音ラボ・On-Jin は音の再配布を禁じているので、公開のリポジトリには鍵をかけた1つのファイルだけを置く。
//
//   node tools/sfx/lock.mjs key     … 新しい鍵を tools/sfx/sfx.key に作る（すでにあれば何もしない。鍵は画面に出さない）
//   node tools/sfx/lock.mjs lock    … public/sfx/lic の mp3 をまとめて tools/sfx/sfx-lic.locked に閉じる
//   node tools/sfx/lock.mjs unlock  … tools/sfx/sfx-lic.locked を public/sfx/lic に戻す
//
// 鍵は環境変数 SFX_KEY（GitHub の Secrets から）か、tools/sfx/sfx.key（手元だけ・gitignore）から読む。
// 中身：「SFXL1」＋ iv 12バイト＋ tag 16バイト＋ AES-256-GCM で閉じた束（見出しの長さ4バイト＋見出しの JSON＋ファイルを並べたもの）
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const DIR = join(root, 'public', 'sfx', 'lic');
const LOCKED = join(here, 'sfx-lic.locked');
const KEY_FILE = join(here, 'sfx.key');
const MAGIC = Buffer.from('SFXL1');

function readKey() {
  const text = process.env.SFX_KEY?.trim() || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : '');
  if (!text) throw new Error('鍵が見つかりません（環境変数 SFX_KEY か tools/sfx/sfx.key）');
  const key = Buffer.from(text, 'base64');
  if (key.length !== 32) throw new Error('鍵の長さが違います（32バイトを base64 で）');
  return key;
}

function lock() {
  const names = readdirSync(DIR).filter((n) => n.endsWith('.mp3')).sort();
  if (names.length === 0) throw new Error('public/sfx/lic に mp3 がありません');
  const bodies = names.map((n) => readFileSync(join(DIR, n)));
  const head = Buffer.from(JSON.stringify(names.map((name, i) => ({ name, size: bodies[i].length }))));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', readKey(), iv);
  const sealed = Buffer.concat([c.update(Buffer.concat([len, head, ...bodies])), c.final()]);
  writeFileSync(LOCKED, Buffer.concat([MAGIC, iv, c.getAuthTag(), sealed]));
  console.log(`閉じました：${names.length}個 → tools/sfx/sfx-lic.locked`);
}

function unlock() {
  const all = readFileSync(LOCKED);
  if (!all.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('sfx-lic.locked の形が違います');
  let at = MAGIC.length;
  const iv = all.subarray(at, at += 12);
  const tag = all.subarray(at, at += 16);
  const d = createDecipheriv('aes-256-gcm', readKey(), iv);
  d.setAuthTag(tag);
  let plain;
  try {
    plain = Buffer.concat([d.update(all.subarray(at)), d.final()]);
  } catch {
    throw new Error('鍵が違うか、sfx-lic.locked が壊れています');
  }
  const headLen = plain.readUInt32BE(0);
  const list = JSON.parse(plain.subarray(4, 4 + headLen).toString('utf8'));
  mkdirSync(DIR, { recursive: true });
  let p = 4 + headLen;
  for (const { name, size } of list) {
    if (!/^[\w-]+\.mp3$/.test(name)) throw new Error(`名前がおかしいファイル：${name}`);
    writeFileSync(join(DIR, name), plain.subarray(p, p += size));
  }
  console.log(`戻しました：${list.length}個 → public/sfx/lic`);
}

function makeKey() {
  if (existsSync(KEY_FILE)) { console.log('鍵はもうあります（tools/sfx/sfx.key）'); return; }
  writeFileSync(KEY_FILE, randomBytes(32).toString('base64') + '\n');
  console.log('鍵を作りました（tools/sfx/sfx.key）。GitHub の Secrets「SFX_KEY」に登録してください');
}

const cmd = process.argv[2];
try {
  if (cmd === 'lock') lock();
  else if (cmd === 'unlock') unlock();
  else if (cmd === 'key') makeKey();
  else throw new Error('使い方：node tools/sfx/lock.mjs key|lock|unlock');
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
