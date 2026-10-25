import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// 演出の打ち切り（投了・画面の片付け）のあとに共有の舞台へ手を出さないよう、
// 演出のファイルは舞台を直接さわらず kit.ts の道具を通す。その決まりを文字で見張る
const DIR = 'src/fx';
// 札ごとの演出（src/fx/cards）と王を取る演出の案（src/fx/kingfx）も同じ決まりで見る
const files = [
  ...readdirSync(DIR).filter((f) => f.endsWith('.ts') && f !== 'kit.ts'),
  ...readdirSync(join(DIR, 'cards')).filter((f) => f.endsWith('.ts')).map((f) => join('cards', f)),
  ...readdirSync(join(DIR, 'kingfx')).filter((f) => f.endsWith('.ts')).map((f) => join('kingfx', f)),
];

// [見張る形, 例外として許す行]
const RULES: [RegExp, RegExp | null, string][] = [
  [/(?<![.\w])sync\(/,/sync\(stage, step\.after, me\)/, '盤の sync は ctx.sync() を使う（player.ts の最後の後始末だけ例外）'],
  [/\.animate\(/, null, '重ね板の動きは kit の animateEl を使う'],
  [/stage\.tween\(/, null, '動きは ctx.tween / ctx.tweenRaw / ctx.wait を使う'],
  [/stage\.shake\s*=/, /stage\.shake = 0;/, '揺れは shakeBy を使う（打ち切りで 0 に戻すのは例外）'],
  [/scene\.add\(/, /scene\.add\(rig\.spot, /, '舞台に物を置くのは transient を使う（stagecraft の光の下ごしらえは例外）'],
];

describe('演出の打ち切りの決まり', () => {
  it('演出のファイルは舞台を直接さわらない', () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = readFileSync(join(DIR, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return; // コメントは見ない
        for (const [re, allow, why] of RULES) {
          if (re.test(line) && !(allow && allow.test(line))) bad.push(`${f}:${i + 1} ${why}: ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
