import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// フォルダの中の .ts をすべて集める（フォルダがなければ0件）
function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

// import / from の行だけを取り出す
function importLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => /\bfrom\s+['"]/.test(l) || /^\s*import\s+['"]/.test(l) || /\bimport\(/.test(l));
}

describe('層の境目', () => {
  it('ルールと CPU の部品は画面の部品を読み込まない', () => {
    const bad: string[] = [];
    for (const dir of ['src/rules', 'src/cards', 'src/ai']) {
      for (const f of tsFiles(dir)) {
        for (const l of importLines(f)) {
          if (/['"]three['"]|three\/|\/view|\/fx|\/app/.test(l)) bad.push(`${f}: ${l.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('画面の部品は本当の局面を作らない', () => {
    const bad: string[] = [];
    for (const dir of ['src/view', 'src/fx']) {
      for (const f of tsFiles(dir)) {
        for (const l of importLines(f)) {
          if (/\b(createGame|applyAction)\b/.test(l)) bad.push(`${f}: ${l.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
