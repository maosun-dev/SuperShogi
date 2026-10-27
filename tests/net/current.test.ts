// 友と対局：いまのつながりを、近くの人と／Game Center のどちらで作るか
import { expect, test, vi } from 'vitest';
import { createPairLinks } from '../../src/net/link';
import { createFakeGcPlugins, createGcLink } from '../../src/net/gcLink';

// 本物の窓口（iPhone の部品）の代わりに、テスト用の偽物を使う
const nearby = createPairLinks().a;
const gc = createGcLink(createFakeGcPlugins().a, '1');
vi.mock('../../src/net/link', async (orig) => ({ ...(await orig<typeof import('../../src/net/link')>()), pickLink: () => nearby }));
vi.mock('../../src/net/gcLink', async (orig) => ({ ...(await orig<typeof import('../../src/net/gcLink')>()), pickGcLink: () => gc }));

const { getSession, sessionKind, currentGcLink, endSession } = await import('../../src/net/current');

test('つなぎ方を替えると、前のつながりは閉じて新しく作る', () => {
  const g = getSession('gc');
  expect(sessionKind()).toBe('gc');
  expect(currentGcLink()).toBe(gc);
  const n = getSession('nearby');
  expect(n).not.toBe(g);
  expect(g.phase()).toBe('closed');
  expect(sessionKind()).toBe('nearby');
  expect(currentGcLink()).toBeNull();
  endSession();
});

test('つなぎ方を省けば、いまのつなぎ方のまま', () => {
  const g = getSession('gc');
  expect(getSession()).toBe(g);
  expect(sessionKind()).toBe('gc');
  endSession();
  expect(sessionKind()).toBeNull();
});

test('Game Center の合言葉は漢数字2つ', () => {
  const g = getSession('gc');
  g.host();
  expect(g.code()).toMatch(/^.+の[一二三四五六七八九]{2}$/);
  endSession();
});
