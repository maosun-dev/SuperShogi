// 対局画面：上の帯・盤・下の帯・手札。タップを reduceInput で合法な行動に変え、進行役に渡す。
// friend のときは友と対局：進行役は FriendMatch、下の帯に「待った」の判、待ったの短冊、つなぎ直しの幕を出す。戦績は付けない
import type { CardId, GameEvent, GameState, HandKind, Result, Side, Square } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { validateDeck } from '../../cards';
import { keikoOf, type Keiko } from '../keiko';
import { createMatch, type Match, type Presenter } from '../match';
import { createFriendMatch, type FriendMatch } from '../friendMatch';
import { endSession, peekSession } from '../../net/current';
import { fakeCut } from '../../net/fakeLink';
import { isNativeApp } from '../native';
import type { FoeLabel } from '../../view/hud';
import { createBrowserCpu } from '../cpu';
import { isBoardTap, liftedSquare, reduceInput, type InputEvent, type InputState } from '../../view/input';
import { getStage } from '../../view/stage';
import { setHighlights, squareAt } from '../../view/board3d';
import { releaseLift, setLifted, sync } from '../../view/pieces3d';
import { getSound } from '../../fx/sound';
import { createHud } from '../../view/hud';
import { createPresenter } from '../../fx/player';
import { setKingFx, skipFinale } from '../../fx/finale';
import { drawKingFx, isKingFx, type KingFx } from '../../fx/kingfx/kinds';
import { showScreen, type Screen } from '../screens';
import { installAutoPlay, installFxKey } from '../dev';
import { loadHandicap, loadSettings, recordResult, safeStore } from '../storage';
import { outcomeOf, type Outcome } from '../outcome';
import { button, el } from './ui';

export interface MatchParams {
  level: Level;
  deck: CardId[];
  keiko?: Keiko;       // 稽古の対局（戦績に数えない）
  foeDeck?: CardId[];  // 稽古で札見せのときに決めた相手の持ち込み
  initial?: GameState; // 開発用：本当の局面を差し込む（演出の試し口 ?fx=）。通常は使わない
  fxKey?: boolean;     // 開発用：Space キーでカードを使う
  auto?: boolean;      // 開発用：人間側も CPU が指す自動対局（?auto=）。演出は短め・戦績に数えない
  friend?: boolean;    // 友と対局（札・先手はつながりの setup から）
  first?: Side;        // 札見せのくじで決めた先手（CPU 戦）
  kingFx?: KingFx;     // 札見せのくじで決めた王を取る演出（CPU 戦。友と対局は setup から）
}

const TAP_SLOP = 10; // これ以上指が動いたらタップとみなさない（px）
const REFUSED_MS = 1600; // 「断られました」を見せる長さ

function paramsOf(p: unknown): MatchParams {
  const q = (p ?? {}) as Partial<MatchParams>;
  const level: Level = q.level ?? 'weak';
  const deck = q.deck ?? [];
  const keiko = keikoOf(q.keiko);
  // 相手の札が決まりに合わなければ、強さごとの札にする
  const foeDeck = keiko && q.foeDeck && validateDeck(q.foeDeck) === null ? q.foeDeck : undefined;
  if (q.friend) return { level, deck, friend: true };
  const first: Side | undefined = q.first === 'sente' || q.first === 'gote' ? q.first : undefined;
  const kingFx = isKingFx(q.kingFx) ? q.kingFx : undefined;
  const bad = validateDeck(deck);
  if (bad) {
    console.error(`持ち込みが正しくないのでカードなしで始めます：${bad}`);
    return { level, deck: [], keiko, foeDeck, first, kingFx };
  }
  // 開発用の口は開発中だけ通す
  if (import.meta.env.DEV) return { level, deck, keiko, foeDeck, first, kingFx, initial: q.initial, fxKey: q.fxKey, auto: q.auto };
  return { level, deck, keiko, foeDeck, first, kingFx };
}

/** 出来事から、最後に動いた駒のマスを出す（なければ null） */
function lastSquare(events: GameEvent[]): Square | null {
  let at: Square | null = null;
  for (const e of events) {
    if (e.type === 'moved' || e.type === 'dropped') at = e.to;
  }
  return at;
}

export function matchScreen(params: unknown): Screen {
  const { level, deck, keiko, foeDeck, first, kingFx, initial, fxKey, auto, friend } = paramsOf(params);
  const session = friend ? peekSession() : null;
  // 友の帯：判子は「友」、名前は合言葉（「友 友」と並ばないように）
  const foe: FoeLabel | undefined = session ? { name: session.code() ?? '友だち', seal: '友', waiting: '友の番' } : undefined;
  let match: Match | null = null;
  let cpu: ReturnType<typeof createBrowserCpu> | null = null;
  let autoCpu: ReturnType<typeof createBrowserCpu> | null = null; // 自動対局で先手を指す2つ目の CPU
  let cleanup: (() => void)[] = [];
  let disposed = false; // unmount 済みなら true
  let recorded = false; // 戦績は1局につき1回だけ記録する
  let stopFx: (() => void) | null = null; // 流している演出を打ち切る（投了・片付けのとき）

  const record = (o: Outcome): void => {
    if (recorded) return;
    recorded = true;
    if (auto || keiko || friend) return; // 自動対局・稽古・友との対局は戦績に数えない
    recordResult(safeStore(), level, o);
  };

  // 結果画面へ（友との対局は friend の印を付けて渡す）
  const toResult = (result: Result): void => {
    void showScreen('result', friend ? { result, level, deck, friend: true } : { result, level, deck, keiko });
  };

  return {
    mount(root) {
      if (friend && !session?.setup()) { void showScreen('link', { notice: 'つながりが切れました' }); return; }
      // 王を取る演出の案：友と対局は2台で同じ案（setup）、CPU 戦は札見せのくじ。開発中は ?king= で差し替えられる
      const devKing = import.meta.env.DEV ? new URLSearchParams(location.search).get('king') : null;
      setKingFx(isKingFx(devKing) ? devKing
        : session?.setup()?.kingFx ?? kingFx ?? drawKingFx(loadSettings(safeStore()).kingFx, Math.random()));
      const box = document.createElement('div');
      box.className = 'match';
      box.dataset.screen = 'match';
      root.append(box);
      const hud = createHud(box);
      const stage = getStage();
      const host = document.createElement('div');
      host.className = 'stage-host';
      hud.board.prepend(host);
      stage.attach(host);
      stage.mode = 'match';

      let st: InputState = { mode: 'idle' };
      let lastMove: Square[] = [];
      let thinking = false;
      let resigning = false; // 投了の演出を流している（盤と帯の更新・投了の確かめを止める）
      let opening = true;    // 始まりの「開戦」を見せている間は指せない
      let drawGen = 0;       // 待ったで描き直すたびに進める（打ち切った演出のあとの古い描き直しを捨てる）

      // 自動対局は、保存された設定を書き換えずに演出を「短め」にする
      const fx = createPresenter(stage, hud, 'sente', auto ? { fx: 'short' } : undefined);
      stopFx = () => fx.cancel();
      // 演出のあと、最後に動いたマスと帯を更新する。
      // 決まり：present は決して reject しない（失敗は握って console.error）。
      // 片付け済みの対局は、共有の舞台に描かないよう何もしない
      const presenter: Presenter = {
        async present(step) {
          if (disposed) return;
          const g = drawGen;
          await fx.present(step); // fx.present は reject しない
          if (disposed || resigning || g !== drawGen) return;
          try {
            const at = lastSquare(step.events);
            if (at) lastMove = [at];
            setHighlights(stage, [], lastMove);
            thinking = step.actor === 'sente' && !step.after.result;
            hud.render(step.after, 'sente', { thinking, level, keiko: !!keiko, foe });
          } catch (e) {
            console.error('演出のあとの画面の更新に失敗しました', e);
          }
        },
      };

      // 友と対局：待ったの判・短冊・つなぎ直しの幕（下の createNetUi）
      const net = session ? createNetUi(box, hud.root) : null;
      let fm: FriendMatch | null = null;
      let m: Match;
      if (session) {
        fm = createFriendMatch({
          session, presenter,
          onOver: (result) => toResult(result),
          onDesync: () => notice('盤面が合わなくなりました'),
          onRewind: () => rewound(),
          onTurn: () => afterNet(),
        });
        m = fm;
      } else {
        cpu = createBrowserCpu();
        m = createMatch({
          level, humanDeck: deck, foeDeck, cpu, presenter, initial, handicap: loadHandicap(safeStore()), first,
          onOver: (result: Result) => {
            record(outcomeOf(result));
            toResult(result);
          },
        });
      }
      match = m;

      const usable = (): Set<number> => {
        const s = new Set<number>();
        for (const a of m.legal()) if (a.type === 'card') s.add(a.uid);
        return s;
      };
      const refresh = (): void => {
        hud.render(m.view(), 'sente', { thinking, level, keiko: !!keiko, usable: usable(), foe });
        if (net && session) net.setMatta(session.canMatta() && m.phase() !== 'presenting' && !net.blocking());
      };

      // 入力の状態に合わせて、光るマス・案内の帯・選んでいる札を出す
      function show(res: ReturnType<typeof reduceInput>): void {
        const was = liftedSquare(st);
        st = res.state;
        // 選んだ駒を浮かせる（行き先を待つ間だけ）。別の駒を選んだ瞬間に小さく鳴らす
        const at = liftedSquare(st);
        setLifted(stage, at ? m.view().board[at.r * 9 + at.c]?.id ?? null : null);
        if (at && !(was && was.c === at.c && was.r === at.r)) getSound().play('tick');
        setHighlights(stage, res.highlights, lastMove);
        if (st.mode === 'promote') hud.askPromote();
        else hud.setPrompt(res.prompt ?? null, { stop: st.mode === 'second', choices: res.choices });
        hud.select({
          hand: st.mode === 'drop' ? st.kind : null,
          card: st.mode === 'card' || st.mode === 'pick' ? st.uid : null,
        });
      }

      async function submit(action: NonNullable<ReturnType<typeof reduceInput>['action']>): Promise<void> {
        st = { mode: 'idle' };
        // 浮いている駒は今の高さのまま演出に引き継ぐ
        releaseLift();
        hud.setPrompt(null);
        hud.select({});
        hud.lock(true);
        try {
          await m.submit(action);
        } catch (e) {
          console.error('対局を進められませんでした', e);
        }
        if (m.phase() === 'human' && !net?.blocking()) {
          thinking = false;
          refresh();
          hud.lock(false);
        } else if (net) {
          thinking = m.phase() === 'cpu';
          refresh();
        }
      }

      // 人間の手番のときだけ受け付ける（演出中・CPU の考え中は何もしない）
      function dispatch(ev: InputEvent): void {
        if (opening || m.phase() !== 'human' || net?.blocking()) return;
        const res = reduceInput(m.view(), m.legal(), st, ev);
        show(res);
        if (res.action) void submit(res.action);
      }

      hud.on('hand', (k) => dispatch({ type: 'hand', kind: k as HandKind }));
      hud.on('card', (u) => {
        if (opening || m.phase() !== 'human' || net?.blocking()) return;
        const uid = u as number;
        // 対象を選んでいる最中に同じ札を押したら、選ぶのをやめる
        if ((st.mode === 'card' || st.mode === 'pick') && st.uid === uid) { dispatch({ type: 'cancel' }); return; }
        hud.showDetail(uid, usable().has(uid));
      });
      hud.on('use', (u) => dispatch({ type: 'useCard', uid: u as number }));
      hud.on('promote', (y) => dispatch({ type: 'promote', yes: y as boolean }));
      hud.on('pick', (k) => dispatch({ type: 'pick', kind: k as HandKind }));
      hud.on('stop', () => dispatch({ type: 'stop' }));
      hud.on('cancel', () => dispatch({ type: 'cancel' }));

      // 盤のタップ：押した所と離した所が近いときだけ
      let down: { x: number; y: number; id: number } | null = null;
      const onDown = (e: PointerEvent): void => {
        down = isBoardTap(e.pointerType, e.button) ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
      };
      const onUp = (e: PointerEvent): void => {
        const d = down;
        down = null;
        if (!d || d.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
        if (m.phase() !== 'human') return;
        const sq = squareAt(stage, e.clientX, e.clientY);
        if (sq) dispatch({ type: 'square', sq });
      };
      // 選んだ駒・札を取り消す：Esc と、マウスの右クリック（ブラウザのメニューは出さない）
      const cancelSel = (): void => { hud.hideDetail(); dispatch({ type: 'cancel' }); };
      const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') cancelSel(); };
      const onMenu = (e: MouseEvent): void => { e.preventDefault(); cancelSel(); };
      // 決着・投了の筆文字を書いている間は、画面のどこを押しても残りを飛ばす（それより前は skipFinale が何もしない）
      const onSkip = (): void => { if (resigning || m.result()) skipFinale(); };
      box.addEventListener('pointerdown', onSkip);
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey);
      box.addEventListener('contextmenu', onMenu);
      cleanup = [
        () => host.removeEventListener('pointerdown', onDown),
        () => host.removeEventListener('pointerup', onUp),
        () => window.removeEventListener('keydown', onKey),
        () => box.removeEventListener('contextmenu', onMenu),
        () => box.removeEventListener('pointerdown', onSkip),
        () => setHighlights(stage, [], []),
        () => setLifted(stage, null),
      ];
      if (import.meta.env.DEV && fxKey) cleanup.push(installFxKey(m, (a) => { void submit(a); }));
      if (import.meta.env.DEV && auto) {
        autoCpu = createBrowserCpu();
        cleanup.push(installAutoPlay(m, autoCpu, level, submit));
      }

      // ---- 左上の「戻る」と、投了の確かめ ----
      const ask = el('div', 'resign');
      ask.hidden = true;
      ask.setAttribute('role', 'alertdialog');
      ask.setAttribute('aria-modal', 'true');
      const askText = el('p', '', '投了しますか？');
      askText.id = 'resign-text';
      ask.setAttribute('aria-labelledby', 'resign-text');
      const askBox = el('div', 'resign-box');
      const keep = button('ghost', '続ける');
      const yes = button('primary', '投了する');
      const btns = el('div', 'resign-btns');
      btns.append(yes, keep);
      askBox.append(askText, btns);
      ask.append(askBox);
      box.append(ask);
      const back = button('back', '戻る');
      hud.root.querySelector('.side.foe .row')?.prepend(back);
      const closeAsk = (): void => { ask.hidden = true; back.focus(); };
      back.addEventListener('click', () => {
        if (m.phase() === 'over' || resigning) return; // 決着済み・投了中：もうすぐ結果画面へ移る
        ask.hidden = false;
        keep.focus();
      });
      keep.addEventListener('click', closeAsk);
      ask.addEventListener('click', (e) => { if (e.target === ask) closeAsk(); });
      yes.addEventListener('click', () => {
        if (m.phase() === 'over' || yes.disabled) return;
        yes.disabled = true;
        ask.hidden = true;
        // 決着の演出の最中なら、本当の結果を記録してすぐ結果画面へ
        const r = m.result();
        if (r) {
          record(outcomeOf(r));
          m.dispose();
          fx.cancel();
          toResult(r);
          return;
        }
        // 友と対局：相手に投了を知らせ、投了の演出のあと結果画面へ
        if (fm) {
          const lost = fm.resign();
          resigning = true;
          hud.lock(true);
          void fx.resign(m.view()).then(() => { if (!disposed) toResult(lost); });
          return;
        }
        // 投了：負けを記録し、王が伏せられて「負」を書く演出のあと結果画面へ
        record('loss');
        m.dispose();
        resigning = true;
        hud.lock(true);
        void fx.resign(m.view()).then(() => {
          if (disposed) return;
          void showScreen('result', { result: { winner: 'gote', reason: 'resign' }, level, deck, keiko });
        });
      });
      const onAskKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !ask.hidden) closeAsk(); };
      window.addEventListener('keydown', onAskKey);
      cleanup.push(() => window.removeEventListener('keydown', onAskKey));

      // ---- 友と対局：つながりの知らせ ----
      // 演出の途中に来た知らせ（待ったを求められた・切れた）は、演出が終わってから出す
      let askLater = false;
      let lostLater = false;
      function clearInput(): void {
        st = { mode: 'idle' };
        releaseLift();
        setLifted(stage, null);
        hud.setPrompt(null);
        hud.select({});
        hud.hideDetail();
        setHighlights(stage, [], lastMove);
      }
      // 演出が終わっていれば、待っていた知らせを出し、自分の番で何も出ていなければ押せるようにする
      function afterNet(): void {
        if (disposed || resigning || !net) return;
        if (m.phase() === 'presenting') return;
        if (lostLater) { lostLater = false; net.wait('つなぎ直しています', 'やめる', quitToTitle); }
        if (askLater) { askLater = false; showAsk(); }
        thinking = m.phase() === 'cpu';
        refresh();
        hud.lock(m.phase() !== 'human' || net.blocking());
      }
      function quitToTitle(): void {
        endSession();
        void showScreen('title');
      }
      function notice(text: string): void {
        if (!net) return;
        m.dispose();
        fx.cancel();
        net.hideNote();
        net.wait(text, 'タイトルへ', quitToTitle);
        hud.lock(true);
      }
      function showAsk(): void {
        if (!net || !session) return;
        clearInput();
        net.note('待ったを求められています', [
          { label: '受ける', cls: 'yes', run: () => { net.hideNote(); session.replyMatta(true); } },
          { label: '断る', cls: 'pcancel', run: () => { net.hideNote(); session.replyMatta(false); afterNet(); } },
        ]);
        hud.lock(true);
      }
      // 待ったが通った：演出を打ち切り、戻した盤を描き直す
      function rewound(): void {
        if (!net) return;
        drawGen++;
        fx.interrupt(); // 流している演出だけ止める（このあとの演出は流す）
        getSound().play('hyoshigi');
        net.hideNote();
        clearInput();
        lastMove = [];
        sync(stage, m.view(), 'sente');
        setHighlights(stage, [], []);
        afterNet();
      }
      if (net && session) {
        net.onMatta(() => {
          if (m.phase() === 'presenting' || !session.requestMatta()) return;
          clearInput();
          net.note('待ったを求めています', [
            { label: '取り消す', cls: 'pcancel', run: () => { net.hideNote(); session.cancelMatta(); afterNet(); } },
          ]);
          hud.lock(true);
          refresh();
        });
        const offNet = session.on((e) => {
          if (disposed) return;
          switch (e.type) {
            case 'mattaAsked':
              askLater = true;
              afterNet();
              return;
            case 'mattaAnswered':
              if (!e.ok) {
                net.note('断られました', []);
                window.setTimeout(() => { if (!disposed) { net.hideNote(); afterNet(); } }, REFUSED_MS);
              }
              return;
            case 'mattaCancelled':
              askLater = false;
              net.hideNote();
              afterNet();
              return;
            case 'lost':
              lostLater = true;
              net.hideNote();
              afterNet();
              return;
            case 'back':
              lostLater = false;
              net.hideWait();
              afterNet();
              return;
            case 'foeQuit':
              notice('相手が対局をやめました');
              return;
          }
        });
        cleanup.push(offNet);
        // 開発用：切断のふり（ブラウザのにせの通信のときだけ）
        if (import.meta.env.DEV && !isNativeApp()) box.append(button('dev-cut', '切断のふり', () => fakeCut(5000)));
      }

      setHighlights(stage, [], []);
      sync(stage, m.view(), 'sente');
      // CPU が先に指すとき（相手の駒落ち）は、考え中を出してから始める
      thinking = m.phase() === 'cpu';
      refresh();
      // 始まりに「開戦」を見せ、消えてから指せる。CPU 戦は CPU もそれまで指さない。
      // 友と対局は相手の手を受け取れるよう先に始め、こちらの入力だけ止める（相手も同じ長さの開戦を見ている）
      hud.lock(true);
      const go = (): void => {
        void m.start().then(() => {
          if (disposed || opening || m.phase() !== 'human' || net?.blocking()) return;
          thinking = false;
          refresh();
          hud.lock(false);
        });
      };
      if (net) go();
      // 開発用の試し口・自動対局では出さない
      const open = import.meta.env.DEV && (fxKey || auto) ? Promise.resolve() : fx.opening(m.view());
      void open.then(() => {
        if (disposed) return;
        opening = false;
        if (!net) { go(); return; }
        if (m.phase() === 'human' && !net.blocking()) hud.lock(false);
      });
    },
    unmount() {
      disposed = true;
      stopFx?.();
      stopFx = null;
      match?.dispose();
      cpu?.dispose();
      match = null;
      cpu = null;
      for (const f of cleanup) f(); // 自動対局の指し手もここで止める
      autoCpu?.dispose();
      autoCpu = null;
      cleanup = [];
    },
  };
}

// ---- 友と対局の小さな部品：下の帯の「待った」の判・待ったの短冊・つなぎ直しの幕 ----
interface NoteButton { label: string; cls: string; run(): void }
interface NetUi {
  setMatta(enabled: boolean): void;
  onMatta(fn: () => void): void;
  note(text: string, buttons: NoteButton[]): void;   // 和紙の短冊（案内の短冊と同じ形）
  hideNote(): void;
  wait(text: string, action: string, run: () => void): void; // 盤を覆う幕（つなぎ直し・相手がやめた）
  hideWait(): void;
  blocking(): boolean;  // 短冊か幕が出ていて、指せない
}

function createNetUi(box: HTMLElement, hudRoot: HTMLElement): NetUi {
  const matta = button('matta-ban', '待った');
  matta.setAttribute('aria-label', '待ったを求める');
  matta.disabled = true;
  hudRoot.querySelector('.side.me .row')?.append(matta);

  const tanzaku = el('div', 'prompt net-prompt');
  tanzaku.hidden = true;
  tanzaku.setAttribute('role', 'alert');
  hudRoot.querySelector('.mine-area')?.append(tanzaku);

  const veil = el('div', 'resign net-wait');
  veil.hidden = true;
  veil.setAttribute('role', 'alertdialog');
  veil.setAttribute('aria-modal', 'true');
  const vBox = el('div', 'resign-box');
  const vText = el('p');
  const vBtn = button('primary', '');
  vBox.append(vText, vBtn);
  veil.append(vBox);
  box.append(veil);
  let vRun: (() => void) | null = null;
  vBtn.addEventListener('click', () => vRun?.());

  return {
    setMatta(enabled) { matta.disabled = !enabled; },
    onMatta(fn) { matta.addEventListener('click', fn); },
    note(text, buttons) {
      tanzaku.replaceChildren(el('span', 'ptext', text));
      if (buttons.length) {
        const row = el('span', 'pbtns');
        for (const b of buttons) row.append(button(b.cls, b.label, b.run));
        tanzaku.append(row);
      }
      tanzaku.hidden = false;
      tanzaku.querySelector('button')?.focus();
    },
    hideNote() { tanzaku.hidden = true; tanzaku.replaceChildren(); },
    wait(text, action, run) {
      vText.textContent = text;
      vBtn.textContent = action;
      vRun = run;
      veil.classList.toggle('waiting', action === 'やめる');
      veil.hidden = false;
      vBtn.focus();
    },
    hideWait() { veil.hidden = true; vRun = null; },
    blocking: () => !tanzaku.hidden || !veil.hidden,
  };
}
