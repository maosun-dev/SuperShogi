// 対局画面：上の帯・盤・下の帯・手札。タップを reduceInput で合法な行動に変え、進行役に渡す。
import type { CardId, GameEvent, HandKind, Result, Square } from '../../rules/types';
import type { Level } from '../../ai/levels';
import { validateDeck } from '../../cards';
import { createMatch, type Match, type Presenter } from '../match';
import { createBrowserCpu } from '../cpu';
import { reduceInput, type InputEvent, type InputState } from '../../view/input';
import { getStage } from '../../view/stage';
import { setHighlights, squareAt } from '../../view/board3d';
import { sync } from '../../view/pieces3d';
import { createHud } from '../../view/hud';
import { createPresenter } from '../../fx/player';
import { showScreen, type Screen } from '../screens';

export interface MatchParams { level: Level; deck: CardId[] }

// 仮の持ち込み（強さ選び・カード選びの画面ができるまで。タスク13で置き換える）
const DEFAULT_DECK: CardId[] = ['rakurai', 'irekae', 'otoshiana', 'tenma'];
const TAP_SLOP = 10; // これ以上指が動いたらタップとみなさない（px）

function paramsOf(p: unknown): MatchParams {
  const q = (p ?? {}) as Partial<MatchParams>;
  const level: Level = q.level ?? 'weak';
  const deck = q.deck ?? DEFAULT_DECK;
  const bad = validateDeck(deck);
  if (bad) {
    console.error(`持ち込みが正しくないので仮の持ち込みで始めます：${bad}`);
    return { level, deck: DEFAULT_DECK };
  }
  return { level, deck };
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
  const { level, deck } = paramsOf(params);
  let match: Match | null = null;
  let cpu: ReturnType<typeof createBrowserCpu> | null = null;
  let cleanup: (() => void)[] = [];

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

      const fx = createPresenter(stage, hud, 'sente');
      // 演出のあと、最後に動いたマスと帯を更新する
      const presenter: Presenter = {
        async present(step) {
          await fx.present(step);
          const at = lastSquare(step.events);
          if (at) lastMove = [at];
          setHighlights(stage, [], lastMove);
          thinking = step.actor === 'sente' && !step.after.result;
          hud.render(step.after, 'sente', { thinking, level });
        },
      };

      cpu = createBrowserCpu();
      const m = createMatch({
        level, humanDeck: deck, cpu, presenter,
        onOver: (result: Result) => { void showScreen('result', { result, level, deck }); },
      });
      match = m;

      const usable = (): Set<number> => {
        const s = new Set<number>();
        for (const a of m.legal()) if (a.type === 'card') s.add(a.uid);
        return s;
      };
      const refresh = (): void => {
        hud.render(m.view(), 'sente', { thinking, level, usable: usable() });
      };

      // 入力の状態に合わせて、光るマス・案内の帯・選んでいる札を出す
      function show(res: ReturnType<typeof reduceInput>): void {
        st = res.state;
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
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey);
      cleanup = [
        () => host.removeEventListener('pointerdown', onDown),
        () => host.removeEventListener('pointerup', onUp),
        () => window.removeEventListener('keydown', onKey),
        () => setHighlights(stage, [], []),
      ];

      setHighlights(stage, [], []);
      sync(stage, m.view(), 'sente');
      refresh();
      void m.start();
    },
    unmount() {
      match?.dispose();
      cpu?.dispose();
      match = null;
      cpu = null;
      for (const f of cleanup) f();
      cleanup = [];
    },
  };
}
