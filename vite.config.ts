import { defineConfig } from 'vite';

export default defineConfig({
  // iPhone 向けに包むときも相対パスで読めるようにする
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
