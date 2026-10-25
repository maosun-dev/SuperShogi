// アイコンの SVG が決めごと（1024 四方・7色とその明暗だけ・字は「傾」）を守っているか確かめる。
import { describe, expect, it } from 'vitest';
import { iconSvg } from '../../tools/icon/icon.mjs';
import { PALS } from '../../src/view/palette';

describe('アイコンの絵', () => {
  it('アイコンの SVG は 1024 四方で、7色以外の色を使わない', () => {
    const svg = iconSvg('Yuji Boku');
    expect(svg).toContain('viewBox="0 0 1024 1024"');
    const allowed = new Set(Object.values(PALS).map((c) => c.toUpperCase()));
    const used = svg.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) expect(allowed.has(c.toUpperCase()), c).toBe(true);
    // 3桁の短い色や名前の色（white など）で抜け道を作っていない
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/);
    expect(svg).not.toMatch(/(fill|stroke|stop-color|flood-color)="(?!url|none|#)[a-z]/i);
  });

  it('字は「傾」', () => {
    const svg = iconSvg('Yuji Boku');
    expect(svg).toContain('傾');
    expect(svg).toContain('Yuji Boku');
  });
});
