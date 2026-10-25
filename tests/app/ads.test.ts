import { describe, it, expect } from 'vitest';
import { bannerOn, createAds, type AdsPlugin } from '../../src/app/ads';

const REAL_BANNER = 'ca-app-pub-7017663942238206/5630427089';

// 呼ばれた順を記録する偽のプラグイン。各関数は差し替えられる
function fakePlugin(over: Partial<AdsPlugin> = {}) {
  const calls: string[] = [];
  const opts: unknown[] = [];
  let sizeFn: ((s: { width: number; height: number }) => void) | null = null;
  const p: AdsPlugin = {
    trackingAuthorizationStatus: async () => { calls.push('status'); return { status: 'authorized' }; },
    requestTrackingAuthorization: async () => { calls.push('request'); },
    requestConsentInfo: async () => { calls.push('consentInfo'); return { status: 'NOT_REQUIRED', isConsentFormAvailable: false }; },
    showConsentForm: async () => { calls.push('consentForm'); return {}; },
    initialize: async () => { calls.push('initialize'); },
    showBanner: async (o) => { calls.push('show'); opts.push(o); },
    hideBanner: async () => { calls.push('hide'); },
    resumeBanner: async () => { calls.push('resume'); },
    addListener: (_ev, fn) => { sizeFn = fn; return {}; },
    ...over,
  };
  return { p, calls, opts, size: (h: number) => sizeFn?.({ width: 375, height: h }) };
}

function make(plugin: AdsPlugin) {
  const heights: number[] = [];
  const ads = createAds({ plugin, setHeight: (px) => heights.push(px), ready: async () => {}, wait: async () => {} });
  return { ads, heights };
}

// 出し入れは裏で進むので、たまった Promise を流し切る
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('バナー広告の係', () => {
  it('bannerOn は対局だけ false', () => {
    for (const n of ['title', 'level', 'deck', 'reveal', 'result', 'zukan', 'settings'] as const) expect(bannerOn(n)).toBe(true);
    expect(bannerOn('match')).toBe(false);
  });

  it('init は 追跡の確認 → 同意 → initialize の順。未決なら確認を頼む', async () => {
    let n = 0;
    const f = fakePlugin({
      trackingAuthorizationStatus: async () => { f.calls.push('status'); return { status: n++ === 0 ? 'notDetermined' : 'authorized' }; },
    });
    await make(f.p).ads.init();
    expect(f.calls).toEqual(['status', 'request', 'status', 'consentInfo', 'initialize']);
  });

  it('追跡の確認は決まらなければ最大5回まで頼む', async () => {
    const f = fakePlugin({
      trackingAuthorizationStatus: async () => { f.calls.push('status'); return { status: 'notDetermined' }; },
    });
    await make(f.p).ads.init();
    expect(f.calls.filter((c) => c === 'request')).toHaveLength(5);
    expect(f.calls).toContain('initialize');
  });

  it('同意の画面は、必要（REQUIRED）で用意があるときだけ出す', async () => {
    const need = fakePlugin({
      requestConsentInfo: async () => ({ status: 'REQUIRED', isConsentFormAvailable: true }),
    });
    await make(need.p).ads.init();
    expect(need.calls.filter((c) => c === 'consentForm')).toHaveLength(1);
    const no = fakePlugin();
    await make(no.p).ads.init();
    expect(no.calls).not.toContain('consentForm');
  });

  it('準備の前に頼まれた「出す」は、initialize のあとで showBanner になる', async () => {
    const f = fakePlugin();
    const { ads } = make(f.p);
    ads.setWanted(true);
    expect(f.calls).not.toContain('show');
    await ads.init();
    await flush();
    expect(f.calls.indexOf('show')).toBeGreaterThan(f.calls.indexOf('initialize'));
    expect(f.opts[0]).toMatchObject({ adId: REAL_BANNER, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: false });
  });

  it('2回目に出すときは resumeBanner、隠すときは hideBanner と高さ0', async () => {
    const f = fakePlugin();
    const { ads, heights } = make(f.p);
    await ads.init();
    ads.setWanted(true); await flush();
    ads.setWanted(false); await flush();
    ads.setWanted(true); await flush();
    expect(f.calls.filter((c) => ['show', 'hide', 'resume'].includes(c))).toEqual(['show', 'hide', 'resume']);
    expect(heights).toContain(0);
  });

  it('出している途中で隠すと頼まれたら、出し終わったらすぐ隠す', async () => {
    let done: () => void = () => {};
    const f = fakePlugin({
      showBanner: () => { f.calls.push('show'); return new Promise<void>((r) => { done = r; }); },
    });
    const { ads, heights } = make(f.p);
    await ads.init();
    ads.setWanted(true); await flush();
    ads.setWanted(false); await flush();
    done(); await flush();
    expect(f.calls.filter((c) => ['show', 'hide'].includes(c))).toEqual(['show', 'hide']);
    expect(heights.at(-1)).toBe(0);
  });

  it('高さの知らせ：出しているときだけ setHeight に渡す', async () => {
    const f = fakePlugin();
    const { ads, heights } = make(f.p);
    await ads.init();
    ads.setWanted(true); await flush();
    f.size(62);
    expect(heights.at(-1)).toBe(62);
    ads.setWanted(false); await flush();
    f.size(70);
    expect(heights.at(-1)).toBe(0);
  });

  it('プラグインが失敗しても例外を外へ出さず、高さは0', async () => {
    const f = fakePlugin({
      initialize: async () => { throw new Error('x'); },
      trackingAuthorizationStatus: async () => { throw new Error('y'); },
    });
    const { ads, heights } = make(f.p);
    ads.setWanted(true);
    await expect(ads.init()).resolves.toBeUndefined();
    await flush();
    expect(f.calls).not.toContain('show');
    expect(heights.every((h) => h === 0)).toBe(true);
  });
});
