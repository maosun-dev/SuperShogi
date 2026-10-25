// 遊び方の絵巻を初回だけ出すための印。端末に保存し、保存が使えないときもその起動の中では1回だけにする
import type { KeyValueStore } from '../storage';

export const HOWTO_KEY = 'superShogi.howtoSeen';

// safeStore() は保存が使えないと呼ぶたびに新しいメモリの代わりを返すので、起動の中の印はここに持つ
let seenThisRun = false;

/** 絵巻をまだ見ていなければ true */
export function shouldShowHowto(st: KeyValueStore): boolean {
  if (seenThisRun) return false;
  try { return st.getItem(HOWTO_KEY) !== '1'; } catch { return true; }
}

/** 絵巻を開いたことを覚える */
export function markHowtoSeen(st: KeyValueStore): void {
  seenThisRun = true;
  try { st.setItem(HOWTO_KEY, '1'); } catch { /* 保存できなくても、この起動の中では覚えている */ }
}

/** テスト用：起動の中の印を消す */
export function resetHowtoMemo(): void {
  seenThisRun = false;
}
