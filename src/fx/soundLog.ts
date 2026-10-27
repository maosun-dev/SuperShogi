// 音の記録。iPhone で裏から戻ると音が消える件を、実機で何が起きているか見るため（2026-10-27）。
// 設定画面の「音の大きさ」を続けて5回押すと出る。同じ文が続いたら1行にまとめる
const MAX = 80;
const lines: { text: string; n: number; at: string }[] = [];

const clock = (): string => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
};

export function soundLog(text: string): void {
  const last = lines[lines.length - 1];
  if (last && last.text === text) { last.n++; last.at = clock(); return; }
  lines.push({ text, n: 1, at: clock() });
  if (lines.length > MAX) lines.shift();
}

export function soundLogText(): string {
  return lines.map((l) => `${l.at} ${l.text}${l.n > 1 ? ` ×${l.n}` : ''}`).join('\n');
}

export function clearSoundLog(): void {
  lines.length = 0;
}
