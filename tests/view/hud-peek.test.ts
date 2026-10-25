// 手札にマウスを乗せたときの「のぞき見」：マウスだけ・押して開いた説明は上書きしない
import { describe, expect, it } from 'vitest';
import { peekAllowed } from '../../src/view/hud';

describe('peekAllowed', () => {
  it('マウスで説明が閉じていれば、のぞき見できる', () => {
    expect(peekAllowed('mouse', false, false)).toBe(true);
  });
  it('のぞき見の最中なら、別の札に乗せ替えられる', () => {
    expect(peekAllowed('mouse', true, true)).toBe(true);
  });
  it('押して開いた説明は、乗せただけでは上書きしない', () => {
    expect(peekAllowed('mouse', true, false)).toBe(false);
  });
  it('指やペンでは、のぞき見しない', () => {
    expect(peekAllowed('touch', false, false)).toBe(false);
    expect(peekAllowed('pen', false, false)).toBe(false);
  });
});
