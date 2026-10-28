// 3D・カードの絵・キャンバスの模様で使う色。設計書の7色と、その明暗をここだけに置く。
// CSS 側は src/app/style.css の :root に同じ値がある。

/** 数値形（Three.js 用） */
export const PAL = {
  // 設計書の7色
  kaya: 0xe2b65b, // 榧（盤の木）
  yoru: 0x14213d, // 夜の藍（背景）
  mahou: 0x2b59c3, // 藍（魔法）
  wana: 0xd7263d, // 隈取の紅（罠）
  soubi: 0xc9a227, // 金箔（装備）
  gofun: 0xeee8dc, // 胡粉（紙・駒）
  sumi: 0x1d1a17, // 墨
  // 明暗（試作で使った濃淡）
  yoruLight: 0x22386a,
  yoruDeep: 0x0d1730,
  wanaDeep: 0x7a0f1c,
  kayaLight: 0xf2d594,
  // 3D の盤と駒（試作の値）
  kayaSide: 0xc99a45, // 盤の側面
  kayaLeg: 0x8a5a22, // 盤の脚
  kayaGrain: 0x784614, // 盤の上面の木目
  kayaGrainDeep: 0x5a320a, // 側面の木目
  skyLight: 0xfff1d6, // 空からの光
  yoruGround: 0x1a2a50, // 床からの照り返し
  sunLight: 0xfff0d0, // 日の光
  soubiLight: 0xf2c230, // 装備の金の輪
  mahouPale: 0xaec4ef, // 凍った駒の青み
  // 演出（試作の落雷の値。藍・胡粉・墨の明暗）
  hakkou: 0xffffff, // 白い光（胡粉をいちばん明るくしたもの）
  mahouFlash: 0xcfdcff, // 雷の光
  mahouCore: 0xf2f6ff, // 雷の芯
  mahouGlow: 0x4f7dff, // 雷のまわりの光
  mahouBolt: 0x9fbcff, // 雷が照らす光
  mahouSpark: 0xc9dbff, // 火花
  sumiChar: 0x2a2420, // 焦げたかけら
  sumiBurn: 0x140e0a, // 焦げ跡の芯
  sumiBurnEdge: 0x28180a, // 焦げ跡のふち
  yoruNight: 0x060d22, // 暗くなる空
  // 罠・装備・決着の演出（金箔・胡粉・夜の藍・墨の明暗）
  soubiPale: 0xfff1bf, // 光の柱の芯（金箔をいちばん明るくしたもの）
  haganeSteel: 0xb7c0cf, // 鋼の鎧の鉄色（胡粉を夜の藍へ寄せたもの）
  sumiHole: 0x050403, // 落とし穴の穴の底
  // 札の演出（2026-10-23）：雷雲・煙玉
  stormCloud: 0x2b2932, // 雷雲（墨を夜の藍へ寄せたもの）
  stormLit: 0x8f96c8, // 雲の中で稲妻が光ったときの雲
  smokeShade: 0xc9c4d8, // 煙玉の陰（胡粉を藍へ寄せたもの）
  // 王を取る演出（2026-10-25）：叩き割りの桜・大花火の星の色
  sakura: 0xf4c6cf, // 桜の花びら（胡粉を紅へ寄せたもの）
  hanabiMidori: 0x7ce08f, // 花火の緑
  hanabiMurasaki: 0xb98cff, // 花火の紫
  hanabiDaidai: 0xffa04a, // 花火の橙
  hanabiMizu: 0x86e8ff, // 花火の水色
  // 大詰のエンディング（2026-10-28）：定式幕の3色（強さ選びの幕の切り替えと同じ値）と回り舞台の木
  joshikiKuro: 0x1d1a17, // 定式幕の黒
  joshikiKaki: 0xb4632a, // 定式幕の柿
  joshikiMoegi: 0x3e7b45, // 定式幕の萌葱
  butaiWood: 0x7a5232, // 回り舞台の床（使い込んだ檜）
} as const;

export type PalName = keyof typeof PAL;

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0').toUpperCase();
}

/** 文字列形（'#E2B65B'。SVG・キャンバス用） */
export const PALS = Object.fromEntries(
  Object.entries(PAL).map(([k, v]) => [k, hex(v)]),
) as { [K in PalName]: string };

/** 'rgba(r,g,b,a)' 形（キャンバスの半透明の線・塗り用） */
export function rgba(n: number, a: number): string {
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
