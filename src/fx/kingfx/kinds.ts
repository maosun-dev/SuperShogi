// 王を取る・取られる演出の種類（2026-10-25 3案。墨の龍・屋台崩しはユーザーが外した。絵コンテ docs/mockups/king-capture-ideas.html）。
// 1局ぶんの案は対局の始まりに決める（CPU 戦は札見せのくじと一緒、友と対局は誘った側が引いて setup で送る）。
// three を読まない純粋な部品（友と対局の setup の確かめからも使う）

export const KING_FX = ['tataki', 'iai', 'hanabi'] as const;
export type KingFx = (typeof KING_FX)[number];
/** 設定：決めた1案か、毎局くじ（random） */
export type KingFxChoice = KingFx | 'random';

export const KING_FX_LABEL: Record<KingFx, string> = {
  tataki: '叩き割り',
  iai: '居合一閃',
  hanabi: '大花火',
};

export function isKingFx(v: unknown): v is KingFx {
  return typeof v === 'string' && (KING_FX as readonly string[]).includes(v);
}

/** 1局ぶんの案を決める。rnd は 0以上1未満（くじのときだけ使う） */
export function drawKingFx(choice: KingFxChoice, rnd: number): KingFx {
  if (choice !== 'random') return choice;
  return KING_FX[Math.min(KING_FX.length - 1, Math.max(0, Math.floor(rnd * KING_FX.length)))];
}
