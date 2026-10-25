// 遊び方の絵巻の6枚。文の書き換えはここだけで済むようにする（画面は howto.ts）
import type { CardKind } from '../../cards/types';
import type { DiagramKind } from './pieceDiagram';

export type HowtoFigure =
  | { type: 'pieces'; kinds: DiagramKind[] }          // 駒の動きの図を並べる
  | { type: 'kinds'; items: { kind: CardKind; text: string }[] } // 札の種類の印と文
  | { type: 'none' };
// lines は図の前に、after は図のあとに出す
export interface HowtoPage { title: string; lines: string[]; figure: HowtoFigure; after?: string[] }

export const HOWTO_PAGES: HowtoPage[] = [
  {
    title: '傾将棋とは',
    lines: [
      '将棋に「札」を足した遊びです。',
      '駒を動かして、相手の王を取れば勝ち。札を使うと、盤の上で思いがけないことが起こります。',
    ],
    figure: { type: 'none' },
  },
  {
    title: '駒の動き',
    lines: ['朱の点へは1マス、朱の線はまっすぐどこまでも進めます。駒を飛び越えられるのは桂だけです。'],
    figure: { type: 'pieces', kinds: ['OU', 'HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] },
  },
  {
    title: '成りと持ち駒',
    lines: [
      '相手の陣地（奥の3段）に入る・出る・その中で動くと、駒を裏返して「成る」ことができます。',
      '銀・桂・香・歩は成ると金と同じ動きに。飛は竜、角は馬になります。',
    ],
    figure: { type: 'pieces', kinds: ['RYU', 'UMA'] },
    after: [
      '取った駒は自分の持ち駒になり、手番を使って空いたマスに打てます。',
      '同じ縦の列に自分の歩を2枚置く「二歩」はできません。',
    ],
  },
  {
    title: '詰みはない',
    lines: [
      'この将棋に「詰み」はありません。王を取ったら勝ち、取られたら負けです。',
      '王手を放っておく手も指せますが、そのまま王を取られたら終わり。王手のときは画面で大きく知らせます。',
      '同じ形が4回出るか、300手を超えたら引き分けです。',
    ],
    figure: { type: 'none' },
  },
  {
    title: '札の持ち込み',
    lines: [
      '対局の前に、コストの合計が10までになるように札を選びます。同じ札は1枚までです。',
      '持ち込んだ札は最初から全部使えて、どれも1回きりです。',
      '相手が何を持ち込んだかは、対局の前に見られます。',
    ],
    figure: { type: 'none' },
  },
  {
    title: '札の3つの種類',
    lines: ['札は3つの種類に分かれます。'],
    figure: {
      type: 'kinds',
      items: [
        { kind: 'magic', text: '使うとすぐ効く。使ったら手番が終わる' },
        { kind: 'trap', text: '伏せておき、相手が条件を満たすと発動。伏せても手番は終わらない（1手番に1枚設置できる・同時設置は最大3枚まで）' },
        { kind: 'equip', text: '自分の駒に付ける。使ったら手番が終わる。付けた駒が取られたら消える' },
      ],
    },
    after: ['下の札を押すと説明が出て、「使う」で使えます。全部の札は札図鑑で見られます。'],
  },
];
