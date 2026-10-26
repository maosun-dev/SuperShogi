// 答え合わせの答え（tests/ai/golden-moves.json）を書き出す道具。
// 速くする前に一度だけ走らせる。以後は、答えが変わってよい理由が手順書にあるときだけ書き直す。
// 使い方：npx vite-node tools/arena/golden-record.ts
import { writeFileSync } from 'node:fs';
import { actionKey, search } from '../../src/ai/search';
import { benchPositions, GOLDEN_OPTS } from '../../tests/ai/helpers/positions';

const out = benchPositions().map((s) => {
  const r = search(s, s.turn, { ...GOLDEN_OPTS });
  return { action: actionKey(r.action), score: r.score, depth: r.depth };
});
writeFileSync('tests/ai/golden-moves.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} 局面を書き出しました`);
