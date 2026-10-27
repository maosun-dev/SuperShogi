// アプリが裏に回った・表に戻ったの知らせ。iPhone ではブラウザの visibilitychange が当てにならず、
// 裏から戻ると音が消えたままになったので、アプリ本体（Capacitor の App）の知らせを使う（2026-10-27）。
// 裏に回った＝pause（ホームへ戻った・ほかのアプリへ）、表に戻った＝isActive（通知の幕を下ろしたときも来る）
import { App } from '@capacitor/app';
import { isNativeApp } from './native';
import type { AppLife } from './unlock';
import { soundLog } from '../fx/soundLog';

export function appLife(): AppLife {
  // 調べるための記録：ブラウザの知らせが届いているかも残す
  document.addEventListener('visibilitychange', () => soundLog(`画面 ${document.visibilityState}`));
  if (isNativeApp()) {
    return {
      onBackground(fn) { void App.addListener('pause', () => { soundLog('アプリが裏に'); fn(); }); },
      onActive(fn) {
        void App.addListener('appStateChange', (s) => {
          soundLog(s.isActive ? 'アプリが表に' : 'アプリが手前でなくなった');
          if (s.isActive) fn();
        });
      },
    };
  }
  return {
    onBackground(fn) { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') fn(); }); },
    onActive(fn) { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); }); },
  };
}
