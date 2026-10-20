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
} as const;

export type PalName = keyof typeof PAL;

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0').toUpperCase();
}

/** 文字列形（'#E2B65B'。SVG・キャンバス用） */
export const PALS = Object.fromEntries(
  Object.entries(PAL).map(([k, v]) => [k, hex(v)]),
) as { [K in PalName]: string };
