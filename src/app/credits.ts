// 設定の「クレジット」に載せる、アプリに入っている字体・部品と、その約束（ライセンス）。
// 部品を足したら、ここにも足す（package.json の dependencies と、題字の字の出どころ）
export interface Credit { what: string; name: string; by: string; license: string; url?: string }

export const CREDITS: Credit[] = [
  { what: '題字・見出しの字', name: '青柳衡山フォントT', by: '書：青柳衡山／配布：武蔵システム', license: '商用利用可（字の形だけを使用）', url: 'https://opentype.jp/aoyagikouzanfontt.htm' },
  { what: '字体', name: 'Yuji Boku', by: 'The Yuji Project Authors', license: 'SIL Open Font License 1.1', url: 'https://github.com/Kinutafontfactory/Yuji' },
  { what: '字体', name: 'しっぽり明朝 B1', by: 'The Shippori Mincho Project Authors', license: 'SIL Open Font License 1.1', url: 'https://github.com/fontdasu/ShipporiMincho' },
  { what: '字体', name: 'Dela Gothic One', by: 'The Dela Gothic Project Authors', license: 'SIL Open Font License 1.1', url: 'https://github.com/syakuzen/DelaGothic' },
  { what: '曲', name: 'Suno', by: '曲：maosun-dev（Suno の有料プランで作成）', license: '有料プランで作った曲（商用利用可）', url: 'https://suno.com/' },
  { what: '効果音', name: '効果音ラボ', by: '効果音ラボ', license: '利用規約に従って使用（音の再配布は禁止）', url: 'https://soundeffect-lab.info/' },
  { what: '効果音', name: 'On-Jin ～音人～', by: 'On-Jin ～音人～', license: '利用規約に従って使用（音の二次配布・無断利用は禁止）', url: 'https://on-jin.com/' },
  { what: '3D の描画', name: 'three.js', by: '© 2010-2026 three.js authors', license: 'MIT License', url: 'https://threejs.org/' },
  { what: 'アプリの土台', name: 'Capacitor', by: '© 2017-present Drifty Co.', license: 'MIT License', url: 'https://capacitorjs.com/' },
  { what: '保存', name: '@capacitor/preferences', by: '© 2020-present Ionic', license: 'MIT License' },
  { what: '広告', name: '@capacitor-community/admob', by: '© 2021 Capacitor Community', license: 'MIT License' },
];

/** MIT License の本文（上の MIT の部品はどれもこの文。著作権の行は各部品の by） */
export const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** SIL Open Font License 1.1 の案内（全文は url） */
export const OFL_NOTE = 'Yuji Boku・しっぽり明朝 B1・Dela Gothic One は SIL Open Font License 1.1 のもとで使っています。全文：https://openfontlicense.org/open-font-license-official-text/';
