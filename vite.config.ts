import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// アプリの版（友と対局で、版の違う2台をつながないために使う）
const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const appVersion = /MARKETING_VERSION = ([^;]+);/.exec(pbx)?.[1] ?? 'dev';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // iPhone 向けに包むときも相対パスで読めるようにする
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
