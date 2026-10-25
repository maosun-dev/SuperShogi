# 友と対局（近くの iPhone 2台） 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 目の前の友だちと iPhone 2台で、札・待った・つなぎ直し付きの対局ができるようにする

**Architecture:** 本当の盤面は2台とも同じものを持ち、手の記録だけを送り合う。後手の席の iPhone は見せる形を180度回す（`mirror`）。通信は `Link`（運ぶだけ）→ `Session`（決まりごと・記録・待った・つなぎ直し）→ `FriendMatch`（盤面と演出）の3段。iPhone では Swift の小さな Capacitor 部品（MultipeerConnectivity）、ブラウザでは BroadcastChannel のにせの通信を使う

**Tech Stack:** TypeScript・Vite・Vitest・Capacitor 8（SPM）・Swift（MultipeerConnectivity）

**Spec:** `docs/superpowers/specs/2026-10-25-nearby-match-design.md`

## Global Constraints

- 文言：入口の札「友と対局」、つなぐ画面の札「誘う」「探す」、相手の名前「友」、「つなぎ直しています」「やめる」「相手が対局をやめました」「盤面が合わなくなりました」「同じ版にそろえてください」「相手が札を選んでいます」「待った」「待ったを求めています」「待ったを求められています」「受ける」「断る」「取り消す」「断られました」
- 合言葉：駒の名前（歩兵・香車・桂馬・銀将・金将・角行・飛車）＋「の」＋漢数字（一〜九）
- サービスの名前 `super-shogi`、Info.plist の `NSBonjourServices` は `_super-shogi._tcp`・`_super-shogi._udp`、`NSLocalNetworkUsageDescription` は「近くの友だちと対局するために、近くの iPhone を探します」
- 友との対局は戦績に数えない。対局の中身は保存しない
- コメント・コミットメッセージは日本語

## Review Focus

1. 後手の席で、盤の向き・持ち駒・札・罠の印・決着の勝ち負けが自分視点で正しい → Task 1 の mirror のテストと Task 7 のタブ2枚の確かめ
2. 演出の途中に相手の手が届く／待ったが届く／切れる → Task 4 のテスト（キューで順に処理）
3. つなぎ直しで、自分の送った最後の手が相手に届いていなかった → Task 3 のテスト（`log` で送り直す）
4. 片方がやめたあと、もう片方がつながり直してくる → Task 3 のテスト（対局の番号が無い → `foeQuit`）
5. 版が違う2台 → Task 3 のテスト（`versionMismatch`、つながりを切る）

---

### Task 1: 盤を回す・指紋・記録から盤面を作る

**Files:**
- Create: `src/net/mirror.ts`, `src/net/fingerprint.ts`, `src/net/record.ts`
- Modify: `src/rules/game.ts`（`createGame` の opts に `first?: Side`。駒落ちがあれば駒落ちが勝つ）
- Test: `tests/net/mirror.test.ts`, `tests/net/record.test.ts`

**Interfaces:**
- Produces:
  - `mirrorSq(q: Square): Square`（`{8-c, 8-r}`）・`mirrorSide(s: Side): Side`
  - `mirrorState(s: GameState): GameState`（盤を回して side を入れ替え、players を入れ替え、traps の owner・at、turn、result を回す。`seen` は `{}` にする）
  - `mirrorAction(a: Action): Action`・`mirrorEvents(es: GameEvent[]): GameEvent[]`・`mirrorResult(r: Result): Result`
  - `fingerprint(s: GameState): string`（board・players・traps・turn・ply・trapSetThisTurn・pushFollowUp・result を決まった順で文字にし、FNV-1a 32ビットの16進8桁）
  - `interface Setup { decks: Record<Side, CardId[]>; handicap: Handicap; first: Side }`
  - `buildState(setup: Setup, log: Action[]): GameState`（`createGame` → 順に `applyAction`）
  - `lastTurnStart(setup: Setup, log: Action[], seat: Side): number | null`（log を当てはめながら、seat の手番が始まった位置（その位置の手を指したのが seat）の最後のもの。無ければ null）

- [ ] テスト：全種類の Action・GameEvent（types.ts の union を全部）を `mirror` 2回で元どおり（`toEqual`）／初期局面を回すと先手の玉が `{4,0}` で side が gote／`mirrorResult({winner:'sente',reason:'resign'})` が gote／`fingerprint` は同じ局面で同じ・1手違うと違う／`createGame(..., {first:'gote'}).turn === 'gote'`・駒落ちと first があれば駒落ちの側／`lastTurnStart`：手番の途中で忍札を伏せて指した時は伏せた位置、相手がもう指していても自分の手番の頭、一度も指していなければ null
- [ ] 実装してテストを通す
- [ ] コミット「友と対局：盤を回す・指紋・記録から盤面を作る」

### Task 2: 送るもの・通信の窓口・にせの通信

**Files:**
- Create: `src/net/protocol.ts`, `src/net/link.ts`, `src/net/fakeLink.ts`
- Test: `tests/net/protocol.test.ts`, `tests/net/link.test.ts`

**Interfaces:**
- Produces:
  - `type Msg = {t:'hello'; version:string; matchId:string|null} | {t:'ready'; deck:CardId[]; handicap?:Handicap} | {t:'start'; matchId:string; setup:Setup} | {t:'act'; n:number; action:Action; fp:string} | {t:'resign'; n:number} | {t:'matta'; to:number} | {t:'mattaReply'; ok:boolean; to:number} | {t:'mattaCancel'} | {t:'sync'; n:number} | {t:'log'; from:number; actions:Action[]; fps:string[]} | {t:'quit'}`
  - `encodeMsg(m: Msg): string`・`parseMsg(raw: string): Msg | null`（JSON でない・t が知らない・必要な欄の型が違う → null）
  - `type LinkEvent = {type:'found'; peer:string; name:string} | {type:'lost'; peer:string} | {type:'connected'; peer:string; name:string} | {type:'disconnected'; peer:string} | {type:'message'; data:string}`
  - `interface Link { host(name:string): Promise<void>; browse(): Promise<void>; join(peer:string): Promise<void>; send(data:string): Promise<void>; stop(): Promise<void>; on(fn:(e:LinkEvent)=>void): ()=>void }`
  - `createPairLinks(): { a: Link; b: Link; cut(): void; heal(): void }`（テスト用。a が host・b が browse すると b に found、b が join で両方 connected。send は相手に message（マイクロタスクで非同期・順番どおり）。cut で両方 disconnected、cut 中の send は捨てる。heal 後、また host/browse/join でつながる）
  - `createFakeLink(channel = 'super-shogi-fake'): Link`（開発用。BroadcastChannel でタブ同士を同じ形でつなぐ。タブごとにでたらめな peer の id）
  - `createNativeLink(): Link`（`registerPlugin('Nearby')` の薄い包み。知らせは `addListener` の found/lost/connected/disconnected/message）
  - `pickLink(): Link`（アプリなら native、開発中で `?link=fake` なら fake）
  - `APP_VERSION: string`（vite.config で `__APP_VERSION__` を `ios/App/App.xcodeproj/project.pbxproj` の `MARKETING_VERSION` から埋め込む。テストでは `'test'`）

- [ ] テスト：`parseMsg(encodeMsg(m))` が全種類で元どおり／壊れた文字・知らない t・act の n が文字 → null／`createPairLinks` で host→browse→found→join→connected→send→message、cut で disconnected と送ったものが届かない、heal 後につなぎ直せる
- [ ] 実装してテストを通す（native・fake は型と型チェックだけ。fake は Task 7 で目で見る）
- [ ] コミット「友と対局：送るもの・通信の窓口・にせの通信」

### Task 3: Session（つながり・札選び・くじ・記録・待った・つなぎ直し・片付け）

**Files:**
- Create: `src/net/session.ts`, `src/net/current.ts`
- Test: `tests/net/session.test.ts`

**Interfaces:**
- Consumes: Task 1・2 のもの
- Produces:
  - `type SessionPhase = 'idle'|'hosting'|'browsing'|'deck'|'match'|'reconnecting'|'over'|'closed'`
  - `type SessionEvent = {type:'peers'} | {type:'connected'} | {type:'versionMismatch'} | {type:'start'; setup:Setup} | {type:'act'; action:Action; fp:string|null} | {type:'resign'; seat:Side} | {type:'mattaAsked'} | {type:'mattaAnswered'; ok:boolean} | {type:'mattaCancelled'} | {type:'rewind'; to:number} | {type:'lost'} | {type:'back'} | {type:'foeQuit'} | {type:'closed'}`
  - `createSession(link: Link, opts?: { version?: string; rng?: () => number }): Session`
  - `interface Session { role(): 'host'|'guest'|null; phase(): SessionPhase; code(): string|null; peers(): {peer:string; name:string}[]; seat(): Side; setup(): Setup|null; log(): readonly Action[]; foeReady(): boolean; mattaPending(): 'mine'|'theirs'|null; host(): void; browse(): void; join(peer:string): void; ready(deck:CardId[], handicap?:Handicap): void; sendAct(action:Action, fp:string): void; resign(): void; requestMatta(): boolean; cancelMatta(): void; replyMatta(ok:boolean): void; finish(): void; quit(): void; on(fn:(e:SessionEvent)=>void): ()=>void }`
  - `current.ts`：`getSession(): Session`（無ければ `pickLink()` で作る）・`endSession(): void`（`quit` して捨てる）
- 決まり
  - host は合言葉を rng で作り `link.host(code)`。guest は found を `peers` に貯め `peers` を出す。connected で両方 `hello` を送る。相手の hello の版が違えば `versionMismatch` を出して `link.stop()`・phase `closed`
  - 対局前の connected → phase `deck` と `connected`。対局前に切れたら `closed` と `closed`
  - `ready`：guest は `ready` を送る。host は自分と相手の両方がそろったら matchId（rng の16進）と first（駒落ちがあれば落とした側、無ければ rng < 0.5 で sente）を決め `start` を送り、自分にも `start` を出す。seat：host＝sente、guest＝gote
  - `sendAct`：log に足し `act` を送る。受けた `act`：n が log の長さと同じときだけ足して `act` を出す（違えば捨てる。つなぎ直しの `log` で埋まる）
  - `resign`：送って `resign {seat}` を自分にも出す。受けたら相手の seat で出す
  - `requestMatta`：phase `match`・決着前・`lastTurnStart` が null でない・待ったが無いとき true を返し `matta {to}` を送る。受けた側は `mattaPending='theirs'` で `mattaAsked`。`replyMatta(true)` で両方 log を `to` まで切って `rewind {to}`。断れば `mattaAnswered {ok:false}`。`cancelMatta` は `mattaCancel`。切れたら待ったは両方とも消す（`mattaCancelled`）
  - 対局中に切れた → phase `reconnecting`・`lost`。host は同じ合言葉で `link.host`、guest は `browse` し、名前が合言葉と同じ found に `join`。つながったら hello を確かめ、matchId が違う（どちらかが null も含む）なら `foeQuit` を出して対局を消し phase `closed`。同じなら `sync {n}` を送り、相手の n が短ければ `log` で足りない手と指紋を送る。`log` を受けたら足りない分を足して1つずつ `act` を出す。sync を受けたら phase `match`・`back`
  - `finish`：決着・投了で結果画面へ行くとき。setup・log・matchId を消し phase `over`（つながりは残す。「もう一度」で `ready` から）
  - `quit`：`quit` を送って `link.stop()`、全部消して phase `closed`。`quit` を受けたら `foeQuit` を出して全部消し `link.stop()`

- [ ] テスト（`createPairLinks` で host と guest の2つの Session、rng は決まった数）：つながる→両方 `deck`／版違い→`versionMismatch`／両方 ready→同じ setup の `start`、駒落ちがあれば落とした側が first／act が相手に届き log が同じ／cut→両方 `lost`→heal で自動でつながり `back`、cut 中に送った act が `log` で届く／片方 quit→相手 `foeQuit`／cut 中に片方 quit→heal でつながると残った側に `foeQuit`／待った：受ける→両方 `rewind` で log が同じ長さ、断る→`mattaAnswered false`、取り消す→`mattaCancelled`、相手の手が行き違っても受けたあとの log が同じ／`finish` で setup が null・log が空
- [ ] 実装してテストを通す
- [ ] コミット「友と対局：つながりの流れ（札選び・くじ・待った・つなぎ直し）」

### Task 4: FriendMatch（盤面・向き・演出の順番）

**Files:**
- Create: `src/app/friendMatch.ts`
- Test: `tests/app/friendMatch.test.ts`

**Interfaces:**
- Consumes: `Match`・`Presenter`・`Step`（`src/app/match.ts`）、Session
- Produces: `createFriendMatch(opts: { session: Session; presenter: Presenter; onOver(r: Result): void; onDesync(): void; onRewind(): void }): FriendMatch`。`FriendMatch extends Match`（phase の `'cpu'` は「相手の番」の意味で使う）に `resign(): Result`（自分視点の負けの Result を返し、session.resign）
- 決まり
  - real は `buildState(setup, session.log())`。me＝seat。`view()` は `viewFor(real, me)`、me が gote なら `mirrorState`。`legal()` は phase human のとき `legalActions(viewFor(real, me))` を（gote なら）`mirrorAction`。Step の before/after/events も同じ向きに直す（events は `filterEventsFor(…, me)` のあと mirror）
  - `submit(a)`：本当の向きに戻し applyAction で確かめ、`session.sendAct(a, fingerprint(after))` してから演出
  - session の `act` はキューに入れ、演出が終わるたびに1つずつ当てはめる。fp があり当てはめた後の指紋と違えば `onDesync()`
  - `rewind`：キューを捨て、演出の世代を進めて、log から real を作り直し `onRewind()`（画面が sync で描き直す）
  - 決着したら `session.finish()` は呼ばず `onOver(自分視点の Result)`（finish は画面が結果画面へ行く時に呼ぶ）
- [ ] テスト（2つの FriendMatch を pair の Session でつなぎ、presenter は Step を記録して即 resolve）：host が指すと guest の presenter に回った向きの Step が届き、2つの real の指紋が同じ／guest 視点で自分の玉が `{4,8}`／演出中に届いた2手が順に流れる／desync（fp を書き換えた act）で `onDesync`／待ったを受けると両方 `onRewind` で view が戻る／玉を取った決着が host は勝ち・guest は負け（自分視点）
- [ ] 実装してテストを通す
- [ ] コミット「友と対局：対局の進行役」

### Task 5: 画面（つなぐ・札選び・札見せ・対局・結果・タイトル）

**Files:**
- Create: `src/app/screens/link.ts`
- Modify: `src/app/screens.ts`（ScreenName に `'link'`）、`src/app/main.ts`（登録）、`src/app/screens/title.ts`（3枚目の札）、`deck.ts`（`friend: true`）、`reveal.ts`（`friend: true`）、`match.ts`（`friend: true` で FriendMatch・待ったの判・短冊・つなぎ直しの幕）、`result.ts`（`friend: true`）、`src/view/hud.ts`（render の opts に `foe?: string`。あれば「CPU・…」の代わりに出す）、`src/app/style.css`
- Test: `tests/app/screens-friend.test.ts`（DOM のある既存のテストの形にそろえる。無ければ純粋な関数だけ：`friendResultButtons` など）

- [ ] つなぐ画面：「誘う」「探す」の千社札。誘うと合言葉を大きく、探すと合言葉のボタンの列（`peers` で描き直す）。10秒見つからなければローカルネットワークの案内。版違いの知らせ。connected で `showScreen('deck', {friend:true})`。戻るで `endSession()`・タイトル
- [ ] 札選び（friend）：駒落ちの欄は host だけ。「次へ」で `ready`・「相手が札を選んでいます」。`start` で `showScreen('reveal', {friend:true})`。戻る・`foeQuit`・`closed` → `endSession()`・タイトル（知らせを出す）
- [ ] 札見せ（friend）：setup から自分と相手の札。相手の見出しは「友の持ち込み」。くじの判（「先」「後」を朱で押す、約1秒）を「いざ」の前に。対局へ `{friend:true}`
- [ ] 対局（friend）：FriendMatch を使う。帯の相手は「友」、考え中は「友の番」。下の駒台に「待った」の判（`requestMatta` が通る時だけ押せる）。短冊：自分の待った中（取り消す）、相手の待った（受ける・断る、演出のあとに出す）、断られました。つなぎ直しの幕（「つなぎ直しています」「やめる」）。`foeQuit`・desync は知らせ＋「タイトルへ」。投了は `session.resign` → 演出 → 結果。戦績は付けない
- [ ] 結果（friend）：「もう一度」→ `showScreen('deck',{friend:true})`、「タイトルへ」→ `endSession()`。「相手：友」。結果画面に入ったら `session.finish()`
- [ ] タイトル：3枚目の千社札「友と対局」→ `showScreen('link')`
- [ ] 型・テスト・build を通す
- [ ] コミット「友と対局：画面」

### Task 6: iPhone の近距離の部品（Swift）

**Files:**
- Create: `plugins/capacitor-nearby/package.json`（name `capacitor-nearby`、`"capacitor": {"ios": {"src": "ios"}}`）、`plugins/capacitor-nearby/Package.swift`（product `CapacitorNearby`、target `NearbyPlugin`、path `ios/Sources/NearbyPlugin`）、`plugins/capacitor-nearby/ios/Sources/NearbyPlugin/NearbyPlugin.swift`
- Modify: `package.json`（dependencies に `"capacitor-nearby": "file:plugins/capacitor-nearby"`）、`ios/App/CapApp-SPM/Package.swift`（`npx cap sync ios` で作り直す）、`ios/App/App/Info.plist`

- [ ] `NearbyPlugin`（jsName `Nearby`）：MCPeerID（表示名は合言葉か「guest」）・MCSession（encryptionPreference .required）・MCNearbyServiceAdvertiser（discoveryInfo `["name": 合言葉]`、招待はいつも受ける。1人つながったら誘うのをやめる）・MCNearbyServiceBrowser（found で discoveryInfo の name を知らせる）。send は `.reliable`。peer の id は MCPeerID を覚えた辞書のキー（UUID 文字列）。知らせは main スレッドで `notifyListeners`
- [ ] Info.plist に2つのキー
- [ ] `npx.cmd cap sync ios` で CapApp-SPM に部品が入ることを確かめる
- [ ] コミット「友と対局：iPhone の近距離の部品」

### Task 7: ブラウザのタブ2枚で確かめる・仕上げ

- [ ] `?link=fake` でタブ2枚：誘う→探す→札選び→くじ→札見せ→対局→何手か→待った（受ける・断る）→切断のふり（開発用ボタン）→つなぎ直し→投了→結果→もう一度→タイトルへ。両方の画面を撮って向きと文言を確かめる
- [ ] 全テスト・型・build
- [ ] 版を 0.5.0 に上げる（MARKETING_VERSION）・コミット
- [ ] メモリに進み具合
