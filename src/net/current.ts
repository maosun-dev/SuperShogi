// 友と対局：いまのつながり（画面をまたいで1つだけ持つ）。
// つなぎ方は2つ：近くの人と（近距離通信）・Game Center で。つなぎ方を替えたら前のつながりは閉じる
import { pickLink } from './link';
import { pickGcLink, type GcLink } from './gcLink';
import { makeGcCode } from './gcCode';
import { createSession, type Session } from './session';
import { loadSettings, safeStore } from '../app/storage';

export type LinkKind = 'nearby' | 'gc';

let current: Session | null = null;
let kind: LinkKind | null = null;

/** いまのつながり。無い・閉じている・つなぎ方が違うなら作り直す（つなぎ方を省けば、いまのつなぎ方のまま） */
export function getSession(want?: LinkKind): Session {
  const k = want ?? kind ?? 'nearby';
  if (current && kind !== k) endSession();
  if (!current || current.phase() === 'closed') {
    const kingFx = () => loadSettings(safeStore()).kingFx;
    current = k === 'gc'
      ? createSession(pickGcLink(), { kingFx, makeCode: makeGcCode })
      : createSession(pickLink(), { kingFx });
    kind = k;
  }
  return current;
}

/** いまのつながりのつなぎ方（無ければ null） */
export function sessionKind(): LinkKind | null {
  return current ? kind : null;
}

/** Game Center でつないでいるなら、その窓口（サインイン・合言葉の入力に使う） */
export function currentGcLink(): GcLink | null {
  return current && kind === 'gc' ? pickGcLink() : null;
}

/** いまのつながりがあれば返す（作らない） */
export function peekSession(): Session | null {
  return current;
}

/** やめて捨てる（相手にも知らせる） */
export function endSession(): void {
  current?.quit();
  current = null;
  kind = null;
}
