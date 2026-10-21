import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripWoff } from '../../src/app/fonts';

describe('stripWoff', () => {
  it('woff の項だけを外す', () => {
    expect(stripWoff('src:url(a.woff2) format("woff2"),url(a.woff) format("woff")')).toBe(
      'src:url(a.woff2) format("woff2")',
    );
  });

  it('組み立て後の形（引用符なし・空白あり）にも効く', () => {
    const out = stripWoff(
      "src: url(./x-0-400-normal.woff2) format('woff2'), url(./x-0-400-normal.woff) format('woff');",
    );
    expect(out).toBe("src: url(./x-0-400-normal.woff2) format('woff2');");
  });

  it('woff2 だけの CSS は変わらない', () => {
    const css = 'src: url(a.woff2) format("woff2");';
    expect(stripWoff(css)).toBe(css);
  });

  it('組み立てた CSS に woff の読み込みが残らない', () => {
    const css = readFileSync('node_modules/@fontsource/yuji-boku/400.css', 'utf8');
    const out = stripWoff(css);
    expect(out).toContain('.woff2)');
    expect(out).not.toMatch(/\.woff\)|\.woff"|\.woff'/);
  });
});
