import { describe, it, expect, vi } from 'vitest';

// screens.ts は1つの画面の状態を持つので、テストごとに読み込み直す
async function fresh() {
  vi.resetModules();
  vi.stubGlobal('document', { createElement: () => ({}), body: { append() {} } });
  const m = await import('../../src/app/screens');
  m.initScreens({ replaceChildren() {} } as unknown as HTMLElement);
  m.registerScreen('title', () => ({ mount() {}, unmount() {} }));
  return m;
}

describe('画面の切り替えのフック', () => {
  it('最初の1枚を出すと、その画面の名前でフックが呼ばれる', async () => {
    const m = await fresh();
    const seen: string[] = [];
    m.setScreenHook((n) => seen.push(n));
    await m.showScreen('title');
    expect(seen).toEqual(['title']);
  });

  it('フックが例外を投げても画面は出る', async () => {
    const m = await fresh();
    m.setScreenHook(() => { throw new Error('x'); });
    await expect(m.showScreen('title')).resolves.toBeUndefined();
  });
});

describe('curtainFor（切り替えの幕を引くか）', () => {
  it('エンディングへは引かない（大見得の拍子木からそのまま定式幕へ）。ほかは引く', async () => {
    const { curtainFor } = await import('../../src/app/screens');
    expect(curtainFor('ending')).toBe(false);
    for (const n of ['title', 'result', 'match', 'settings'] as const) expect(curtainFor(n)).toBe(true);
  });
});
