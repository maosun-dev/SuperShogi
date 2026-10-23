// 対局画面：上の帯・盤・下の帯・手札。タップを reduceInput で合法な行動に変え、進行役に渡す。
import type { CardId, GameEvent, GameState, HandKind, Result, Square } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { validateDeck } from '../../cards';
import { keikoOf, type Keiko } from '../keiko';
import { createMatch, type Match, type Presenter } from '../match';
import { createBrowserCpu } from '../cpu';
import { liftedSquare, reduceInput, type InputEvent, type InputState } from '../../view/input';
import { getStage } from '../../view/stage';
import { setHighlights, squareAt } from '../../view/board3d';
import { releaseLift, setLifted, sync } from '../../view/pieces3d';
import { getSound } from '../../fx/sound';
import { createHud } from '../../view/hud';
import { createPresenter } from '../../fx/player';
import { skipFinale } from '../../fx/finale';
import { showScreen, type Screen } from '../screens';
import { installAutoPlay, installFxKey } from '../dev';
import { loadHandicap, recordResult, safeStore } from '../storage';
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
}

const TAP_SLOP = 10; // これ以上指が動いたらタップとみなさない（px）

function paramsOf(p: unknown): MatchParams {
  const q = (p ?? {}) as Partial<MatchParams>;
  const level: Level = q.level ?? 'weak';
  const deck = q.deck ?? [];
  const keiko = keikoOf(q.keiko);
  // 相手の札が決まりに合わなければ、強さごとの札にする
  const foeDeck = keiko && q.foeDeck && validateDeck(q.foeDeck) === null ? q.foeDeck : undefined;
  const bad = validateDeck(deck);
  if (bad) {
    console.error(`持ち込みが正しくないのでカードなしで始めます：${bad}`);
    return { level, deck: [], keiko, foeDeck };
  }
  // 開発用の口は開発中だけ通す
  if (import.meta.env.DEV) return { level, deck, keiko, foeDeck, initial: q.initial, fxKey: q.fxKey, auto: q.auto };
  return { level, deck, keiko, foeDeck };
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
  const { level, deck, keiko, foeDeck, initial, fxKey, auto } = paramsOf(params);
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
    if (auto || keiko) return; // 自動対局と稽古は戦績に数えない
    recordResult(safeStore(), level, o);
  };

  return {
    mount(root) {
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

      // 自動対局は、保存された設定を書き換えずに演出を「短め」にする
      const fx = createPresenter(stage, hud, 'sente', auto ? { fx: 'short' } : undefined);
      stopFx = () => fx.cancel();
      // 演出のあと、最後に動いたマスと帯を更新する。
      // 決まり：present は決して reject しない（失敗は握って console.error）。
      // 片付け済みの対局は、共有の舞台に描かないよう何もしない
      const presenter: Presenter = {
        async present(step) {
          if (disposed) return;
          await fx.present(step); // fx.present は reject しない
          if (disposed || resigning) return;
          try {
            const at = lastSquare(step.events);
            if (at) lastMove = [at];
            setHighlights(stage, [], lastMove);
            thinking = step.actor === 'sente' && !step.after.result;
            hud.render(step.after, 'sente', { thinking, level, keiko: !!keiko });
          } catch (e) {
            console.error('演出のあとの画面の更新に失敗しました', e);
          }
        },
      };

      cpu = createBrowserCpu();
      const m = createMatch({
        level, humanDeck: deck, foeDeck, cpu, presenter, initial, handicap: loadHandicap(safeStore()),
        onOver: (result: Result) => {
          record(outcomeOf(result));
          void showScreen('result', { result, level, deck, keiko });
        },
      });
      match = m;

      const usable = (): Set<number> => {
        const s = new Set<number>();
        for (const a of m.legal()) if (a.type === 'card') s.add(a.uid);
        return s;
      };
      const refresh = (): void => {
        hud.render(m.view(), 'sente', { thinking, level, keiko: !!keiko, usable: usable() });
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
        if (m.phase() === 'human') {
          thinking = false;
          refresh();
          hud.lock(false);
        }
      }

      // 人間の手番のときだけ受け付ける（演出中・CPU の考え中は何もしない）
      function dispatch(ev: InputEvent): void {
        if (m.phase() !== 'human') return;
        const res = reduceInput(m.view(), m.legal(), st, ev);
        show(res);
        if (res.action) void submit(res.action);
      }

      hud.on('hand', (k) => dispatch({ type: 'hand', kind: k as HandKind }));
      hud.on('card', (u) => {
        if (m.phase() !== 'human') return;
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
      const onDown = (e: PointerEvent): void => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
      const onUp = (e: PointerEvent): void => {
        const d = down;
        down = null;
        if (!d || d.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
        if (m.phase() !== 'human') return;
        const sq = squareAt(stage, e.clientX, e.clientY);
        if (sq) dispatch({ type: 'square', sq });
      };
      const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { hud.hideDetail(); dispatch({ type: 'cancel' }); } };
      // 決着・投了の筆文字を書いている間は、画面のどこを押しても残りを飛ばす（それより前は skipFinale が何もしない）
      const onSkip = (): void => { if (resigning || m.result()) skipFinale(); };
      box.addEventListener('pointerdown', onSkip);
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey);
      cleanup = [
        () => host.removeEventListener('pointerdown', onDown),
        () => host.removeEventListener('pointerup', onUp),
        () => window.removeEventListener('keydown', onKey),
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
          void showScreen('result', { result: r, level, deck, keiko });
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

      setHighlights(stage, [], []);
      sync(stage, m.view(), 'sente');
      // CPU が先に指すとき（相手の駒落ち）は、考え中を出してから始める
      thinking = m.phase() === 'cpu';
      refresh();
      void m.start().then(() => {
        if (disposed || m.phase() !== 'human') return;
        thinking = false;
        refresh();
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
