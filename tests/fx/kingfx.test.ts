// 王を取る・取られる演出の案（3案）：くじ・設定の読み戻し・どの案にも流れがあること
import { describe, expect, it } from 'vitest';
import { KING_FX, KING_FX_LABEL, drawKingFx, isKingFx } from '../../src/fx/kingfx/kinds';
import { loadSettings, DEFAULT_SETTINGS } from '../../src/app/storage';

function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe('drawKingFx（1局ぶんの案の決め方）', () => {
  it('決めた案はそのまま', () => {
    expect(drawKingFx('iai', 0.99)).toBe('iai');
  });
  it('くじは乱数で3案のどれか（端も外れない）', () => {
    expect(drawKingFx('random', 0)).toBe('tataki');
    expect(drawKingFx('random', 0.34)).toBe('iai');
    expect(drawKingFx('random', 0.999)).toBe('hanabi');
    expect(drawKingFx('random', 1)).toBe('hanabi');
  });
  it('3案とも名前がある', () => {
    expect(KING_FX).toHaveLength(3);
    for (const k of KING_FX) expect(KING_FX_LABEL[k]).toBeTruthy();
    expect(isKingFx('iai')).toBe(true);
    expect(isKingFx('random')).toBe(false);
    expect(isKingFx('toString')).toBe(false);
  });
});

describe('設定の王を取る演出', () => {
  it('最初はくじ。前の版の保存や変な値もくじ', () => {
    expect(DEFAULT_SETTINGS.kingFx).toBe('random');
    expect(loadSettings(store({ 'superShogi.settings': '{"fx":"short"}' })).kingFx).toBe('random');
    expect(loadSettings(store({ 'superShogi.settings': '{"kingFx":"bomb"}' })).kingFx).toBe('random');
    expect(loadSettings(store({ 'superShogi.settings': '{"kingFx":"hanabi"}' })).kingFx).toBe('hanabi');
    expect(loadSettings(store({ 'superShogi.settings': '{"kingFx":"ryu"}' })).kingFx).toBe('random'); // やめた案
  });
});

describe('取る駒の動き（takerAlong）', () => {
  it('選んで浮いていた駒も、王のマスでは盤の高さに置かれる（勝ちで駒が浮いて見えていた）', async () => {
    const THREE = await import('three');
    const { takerAlong } = await import('../../src/fx/kingfx/common');
    const { PIECE_Y } = await import('../../src/view/pieces3d');
    const taker = new THREE.Object3D();
    const k = {
      kingAt: { c: 4, r: 0 }, at: new THREE.Vector3(0, 0, -4.4), win: true,
      kingId: 1, king: undefined, takerId: 2, taker,
      from: new THREE.Vector3(0, 0, -3.3), fromY: PIECE_Y + 0.23, takerY: PIECE_Y, takerRot: null,
    };
    takerAlong(k, 0);
    expect(taker.position.y).toBeCloseTo(PIECE_Y + 0.23);
    takerAlong(k, 1);
    expect(taker.position.y).toBeCloseTo(PIECE_Y);
    expect(taker.position.z).toBeCloseTo(-4.4);
  }, 30_000); // 演出の部品（three）を読み込むので、機械が忙しいと5秒を超える
});

describe('大花火の見え方（fitView）', () => {
  it('縦長の iPhone では遠くから見て、大輪が横に収まる。字の大きさの元になる横幅も同じだけ見える', async () => {
    const { fitView } = await import('../../src/fx/kingfx/hanabi');
    const pc = fitView(38, 2, 6.8, 12.4);
    const phone = fitView(38, 0.46, 6.8, 12.4);
    expect(pc.dist).toBeCloseTo(12.4);          // 横長はいまの距離のまま
    expect(phone.dist).toBeGreaterThan(pc.dist * 2);
    expect(phone.width).toBeCloseTo(6.8 * 2);   // 大輪の幅ちょうどが画面の横幅
    expect(pc.width).toBeGreaterThan(6.8 * 2);
  }, 30_000);
});

describe('useOomie（大見得を使うか）', () => {
  it('大見得の対局で人が勝ったときだけ。傾奇者に負けたら、いつもの演出', async () => {
    const { useOomie } = await import('../../src/fx/finale');
    expect(useOomie(true, true)).toBe(true);
    expect(useOomie(true, false)).toBe(false);
    expect(useOomie(false, true)).toBe(false);
    expect(useOomie(false, false)).toBe(false);
  });
});
