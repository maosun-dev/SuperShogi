// 効果音の解錠。操作のきっかけで音を出せる状態にし、裏に回ったら止め、表に戻ったら付け直す。
import type { Sound } from '../fx/sound';

export interface EventTargetLike {
  addEventListener(t: string, f: () => void, o?: { capture: boolean }): void;
  removeEventListener(t: string, f: () => void, o?: { capture: boolean }): void;
}

type Unlockable = Pick<Sound, 'unlock' | 'running'>;

// iOS Safari は touchend / click でしか再開を許さないことがあるので、4種類すべてで試す
const KINDS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

// 対象ごとに今ついている解錠の関数を覚えておく（付け直しで二重に登録しないため）
const armed = new WeakMap<object, () => void>();

/** 操作で unlock を試し、音が出せるようになったら登録を外す */
export function armSoundUnlock(sound: Unlockable, target: EventTargetLike): void {
  const old = armed.get(target);
  if (old) for (const k of KINDS) target.removeEventListener(k, old, { capture: true });
  const unlock = (): void => {
    sound.unlock();
    if (sound.running()) {
      for (const k of KINDS) target.removeEventListener(k, unlock, { capture: true });
      if (armed.get(target) === unlock) armed.delete(target);
    }
  };
  armed.set(target, unlock);
  for (const k of KINDS) target.addEventListener(k, unlock, { capture: true });
}

/** アプリが裏に回った・表に戻ったの知らせ（iPhone はアプリ本体から、ブラウザは visibilitychange から） */
export interface AppLife {
  onBackground(fn: () => void): void;
  onActive(fn: () => void): void;
}

/** 裏に回ったら音を止め、表に戻って止まっていたら、すぐ再開を試し、だめなら次の操作で鳴らし直せるよう付け直す */
export function watchAppLife(sound: Unlockable & Pick<Sound, 'sleep'>, target: EventTargetLike, life: AppLife): void {
  life.onBackground(() => sound.sleep());
  life.onActive(() => {
    if (sound.running()) return;
    sound.unlock();
    if (!sound.running()) armSoundUnlock(sound, target);
  });
}
