# バナー広告 手順書（計画14）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 対局の外の画面の下に AdMob のバナーを出し、対局中は隠す（アプリ版だけ）。

**Architecture:** 広告の係 `src/app/ads.ts` がプラグインを包み、出す／隠すと高さ（CSS の `--ad-h`）を受け持つ。画面の切り替え（screens.ts）は差し込まれた関数に新しい画面の名前を渡すだけ。#app の下の端を `--ad-h` ぶん上げるので、各画面は直さない。

**Tech Stack:** TypeScript・Vite・Capacitor 8・`@capacitor-community/admob` 8.1.0・vitest

**Spec:** `docs/superpowers/specs/2026-10-23-banner-ads-design.md`

## Global Constraints

- コメント・コミットメッセージは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- PowerShell では `npm.cmd` / `npx.cmd`（Bash なら `npm` / `npx`）
- プラグインは `@capacitor-community/admob@8.1.0`（ほかのアプリと同じ版）
- 動くのはアプリ版だけ（`isNativeApp()`、src/app/native.ts）。Web 版では何もしない。`?adpreview` は開発中（`import.meta.env.DEV`）だけ
- テスト用の広告の番号：バナー `ca-app-pub-3940256099942544/2435281174`、アプリ `ca-app-pub-3940256099942544~1458002511`
- 確認画面の文：「許可すると、あなたの興味に合った広告が表示されやすくなります。許可しなくても、ゲームはすべて遊べます。」
- 層の境目のテスト（tests/app/boundaries.test.ts）を壊さない：screens.ts は ads.ts を読まない

## Review Focus

- 広告の準備（追跡の確認・initialize）が終わる前に画面が切り替わる → 最後に頼まれた「出す／隠す」が、準備のあとで効くこと（Task 1 のテスト）
- 対局へ入る直前にバナーを出し始めていた → 出し終わったときに「もう隠す」になっていれば、すぐ隠すこと（Task 1 のテスト）
- プラグインの呼び出しが失敗・例外 → 画面は止まらず、`--ad-h` は 0（Task 1 のテスト）
- 隠している間に高さの知らせが届く → `--ad-h` は 0 のまま（Task 1 のテスト）
- 最初の画面（幕なしで出す1枚目）でもバナーの出し入れが呼ばれること（Task 2 のテスト）

---

### Task 1: 広告の係（ads.ts）

**Files:**
- Create: `src/app/ads.ts`
- Test: `tests/app/ads.test.ts`
- Modify: `package.json`（依存を足す）

**Interfaces:**
- Produces:
  - `bannerOn(name: ScreenName): boolean` … `'match'` だけ false
  - `interface AdsPlugin`（使うものだけ）：`trackingAuthorizationStatus(): Promise<{ status: string }>`・`requestTrackingAuthorization(): Promise<void>`・`requestConsentInfo(): Promise<{ status: string; isConsentFormAvailable?: boolean }>`・`showConsentForm(): Promise<unknown>`・`initialize(o: { initializeForTesting: boolean }): Promise<void>`・`showBanner(o: { adId: string; adSize: 'ADAPTIVE_BANNER'; position: 'BOTTOM_CENTER'; margin: 0; isTesting: boolean }): Promise<void>`・`hideBanner(): Promise<void>`・`resumeBanner(): Promise<void>`・`addListener(ev: 'bannerAdSizeChanged', fn: (s: { width: number; height: number }) => void): unknown`
  - `createAds(deps: { plugin: AdsPlugin; setHeight: (px: number) => void; ready: () => Promise<void>; wait: (ms: number) => Promise<void> }): { init(): Promise<void>; setWanted(on: boolean): void }`
    - `ready`：画面が前に出きるまで待つ（本物は document の load と visibilityState）
    - `setHeight`：本物は `document.documentElement.style.setProperty('--ad-h', `${Math.round(px)}px`)`
  - `initAds(): void` … アプリ版なら本物のプラグインで `createAds` を作って init。開発中の `?adpreview` なら仮のバナー（高さ 50px の固定の帯、文字「広告（仮）」）。どちらでもなければ何もしない
  - `setBannerWanted(on: boolean): void` … initAds で作った係へ渡す（まだ無ければ覚えておく）
  - 本物の広告の番号は `REAL_BANNER_ID = ''`（空ならテスト用を使い、`isTesting: true`）

- [ ] **Step 1: 依存を入れる**

Run: `npm install @capacitor-community/admob@8.1.0`
Expected: package.json の dependencies に `"@capacitor-community/admob": "^8.1.0"`（または 8.1.0）が入る

- [ ] **Step 2: 失敗するテストを書く（tests/app/ads.test.ts）**

偽のプラグイン（呼ばれた順を配列に記録。各関数は差し替え可能）と、`setHeight` の記録で確かめる。`wait` と `ready` はすぐ解決する関数。

```ts
it('bannerOn は対局だけ false', () => {
  for (const n of ['title','level','deck','reveal','result','zukan','settings'] as const) expect(bannerOn(n)).toBe(true);
  expect(bannerOn('match')).toBe(false);
});
it('init は 追跡の確認 → 同意 → initialize の順。未決なら確認を頼む', async () => {
  // trackingAuthorizationStatus が 1回目 notDetermined、2回目 authorized
  // 呼ばれた順: trackingAuthorizationStatus, requestTrackingAuthorization, trackingAuthorizationStatus, requestConsentInfo, initialize
});
it('追跡の確認は決まらなければ最大5回まで頼む', async () => { /* ずっと notDetermined → request は5回 */ });
it('同意の画面は、必要（REQUIRED）で用意があるときだけ出す', async () => { /* status REQUIRED・isConsentFormAvailable true → showConsentForm 1回。NOT_REQUIRED → 0回 */ });
it('準備の前に頼まれた「出す」は、initialize のあとで showBanner になる', async () => { /* setWanted(true) → init → showBanner 1回、adId はテスト用、isTesting true */ });
it('2回目に出すときは resumeBanner、隠すときは hideBanner と高さ0', async () => {});
it('出している途中で隠すと頼まれたら、出し終わったらすぐ隠す', async () => { /* showBanner を手で解決する Promise にし、その間に setWanted(false) → 解決後 hideBanner、最後の setHeight は 0 */ });
it('高さの知らせ：出しているときだけ setHeight に渡す', async () => { /* bannerAdSizeChanged(height 62) → 62。隠したあとに届いた 70 → 0 のまま */ });
it('プラグインが失敗しても例外を外へ出さず、高さは0', async () => { /* initialize が reject → init は resolve、showBanner は呼ばれない */ });
```

- [ ] **Step 3: テストが失敗するのを見る**

Run: `npx vitest run tests/app/ads.test.ts`
Expected: FAIL（`../../src/app/ads` が無い）

- [ ] **Step 4: `src/app/ads.ts` を書く**

天落牌の `js/ads.js`（C:\Users\USER\Desktop\game\tenrakuhai\js\ads.js）の askTracking・showBanner・hideBanner の流れにそろえる。追跡の確認は「1回目は 1000ms、2回目からは 2000ms 待ってから頼む」。同意の status が `'REQUIRED'` で `isConsentFormAvailable` のときだけ `showConsentForm`。同意・確認の失敗は握りつぶして initialize へ進む。initialize の失敗で係は止まる（以後の setWanted は何もしない）。本物のプラグインは `import { AdMob } from '@capacitor-community/admob'`。

- [ ] **Step 5: テストが通るのを見る**

Run: `npx vitest run tests/app/ads.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json src/app/ads.ts tests/app/ads.test.ts
git commit -m "広告の係（ads.ts）：追跡の確認・同意・バナーの出し入れと高さ"
```

### Task 2: 画面の切り替えにつなぐ・画面をずらす

**Files:**
- Modify: `src/app/screens.ts`（`setScreenHook` を足し、swap で呼ぶ）
- Modify: `src/app/main.ts`（`initAds()` と `setScreenHook((n) => setBannerWanted(bannerOn(n)))`）
- Modify: `src/app/style.css`（#app の下の端）
- Test: `tests/app/screens.test.ts`（無ければ作る）

**Interfaces:**
- Consumes: Task 1 の `initAds`・`setBannerWanted`・`bannerOn`
- Produces: `setScreenHook(fn: (name: ScreenName) => void): void`（screens.ts。`setClapper` と同じ形。既定は何もしない関数）

- [ ] **Step 1: 失敗するテストを書く**

テストは Node で走る（DOM なし）。`vi.stubGlobal('document', { createElement: () => ({}), body: { append() {} } })` で initScreens を通し、root は `{ replaceChildren() {} }` の偽物。画面は `{ mount() {}, unmount() {} }` を返すだけのものを登録する。最初の1枚は幕を使わないので、幕の動きは要らない。

```ts
it('最初の1枚を出すと、その画面の名前でフックが呼ばれる', async () => {
  const seen: string[] = [];
  setScreenHook((n) => seen.push(n));
  await showScreen('title');
  expect(seen).toEqual(['title']);
});
it('フックが例外を投げても画面は出る', async () => { /* hook が throw → showScreen は resolve */ });
```

- [ ] **Step 2: テストが失敗するのを見る**

Run: `npx vitest run tests/app/screens.test.ts`
Expected: FAIL（`setScreenHook` が無い）

- [ ] **Step 3: screens.ts に `setScreenHook` を足し、`swap` の `current = next` のあとで `hook(name)` を呼ぶ（例外は握りつぶす）。main.ts で `initAds()` を `initScreens` の直後に呼び、フックを差し込む**

- [ ] **Step 4: style.css の #app の inset の下を `calc(env(safe-area-inset-bottom) + var(--ad-h, 0px))` にする**

- [ ] **Step 5: テスト・型・層の境目を確かめる**

Run: `npx vitest run` と `npm run typecheck`
Expected: すべて PASS（boundaries.test.ts も）

- [ ] **Step 6: 見た目を確かめる**

`npm run dev` で `http://localhost:5173/?adpreview` を 375×812 で開く。タイトル・強さ選び・札選び・図鑑・設定・結果で、下のボタンや札が仮のバナーに隠れないこと。対局に入るとバナーが消え、盤の下の帯が画面のいちばん下まで来ること。

- [ ] **Step 7: コミット**

```bash
git add src/app/screens.ts src/app/main.ts src/app/style.css tests/app/screens.test.ts
git commit -m "画面の切り替えでバナーを出し入れし、バナーの高さぶん画面を上げる"
```

### Task 3: iPhone 側の準備

**Files:**
- Modify: `ios/App/App/Info.plist`
- Modify: `ios/` 以下（`npx cap sync ios` が変えるもの）

- [ ] **Step 1: Info.plist に3つ足す**

`GADApplicationIdentifier` = `ca-app-pub-3940256099942544~1458002511`（AdMob でアプリを作ったら差し替える）、`NSUserTrackingUsageDescription` = Global Constraints の文、`SKAdNetworkItems` = `cstr6suwn9.skadnetwork` を1つ（天落牌の Info.plist と同じ形）

- [ ] **Step 2: 組み立てて写す**

Run: `npm run sync`
Expected: エラーなし。`ios/App/CapApp-SPM/Package.swift`（またはPodfile）にプラグインが入る

- [ ] **Step 3: コミット**

```bash
git add ios
git commit -m "iPhone 側の広告の準備（アプリの番号・追跡の確認の文・SKAdNetwork）"
```

- [ ] **Step 4: TestFlight で確かめる（push と送るのはユーザーの確認のあと）**

版を上げて push → `gh workflow run ios-testflight.yml -R maosun-dev/SuperShogi` → `gh run watch`。実機で：初回の起動で追跡の確認画面が出る／タイトルの下にテスト広告のバナー／対局に入ると消える／結果画面でまた出る。
