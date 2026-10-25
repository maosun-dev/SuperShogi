// 友と対局：いまのつながり（画面をまたいで1つだけ持つ）
import { pickLink } from './link';
import { createSession, type Session } from './session';
import { loadSettings, safeStore } from '../app/storage';

let current: Session | null = null;

/** いまのつながり。無い・閉じていれば作り直す */
export function getSession(): Session {
  if (!current || current.phase() === 'closed') current = createSession(pickLink(), { kingFx: () => loadSettings(safeStore()).kingFx });
  return current;
}

/** いまのつながりがあれば返す（作らない） */
export function peekSession(): Session | null {
  return current;
}

/** やめて捨てる（相手にも知らせる） */
export function endSession(): void {
  current?.quit();
  current = null;
}
