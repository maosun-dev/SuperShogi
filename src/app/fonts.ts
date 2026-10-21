// 文字ファイルの軽量化：CSS の src から woff（古い形式）の項だけを外す。
// woff2 だけ残せば iPhone（Safari 系）では困らない。
// ※ tools/strip-woff.mjs が Node から直接読むので、型を消すだけで JS になる書き方にとどめる。

// 「, url(....woff) format("woff")」の 1 項を、前のカンマごと外す（woff2 には当たらない）
const WOFF_ENTRY = /,\s*url\(\s*(["']?)[^)"']*\.woff\1\s*\)\s*format\(\s*(["'])woff\2\s*\)/g;

export function stripWoff(css: string): string {
  return css.replace(WOFF_ENTRY, '');
}
