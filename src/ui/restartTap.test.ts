import { describe, expect, it } from 'vitest';
import { fanLayout } from './fanLayout';
import { footSideAt, footTapAction } from './restartTap';

describe('restart taps', () => {
  it('finds the corner foot buttons and not the middle of the screen', () => {
    const width = 390;
    const height = 844;
    const layout = fanLayout(width);
    const left = footSideAt(layout.insetLeft + 36, height - layout.insetBottom - 36, width, height, layout);
    const right = footSideAt(width - layout.insetRight - 36, height - layout.insetBottom - 36, width, height, layout);
    expect(left).toBe('left');
    expect(right).toBe('right');
    expect(footSideAt(width / 2, height / 2, width, height, layout)).toBeNull();
  });

  it('kicks from a ready or live foot tap and does not store a game-over tap', () => {
    expect(footTapAction('ready')).toBe('kick');
    expect(footTapAction('playing')).toBe('kick');
    expect(footTapAction('over')).toBe('ignore');
    expect(footTapAction('dropped')).toBe('ignore');
    expect(footTapAction('menu')).toBe('ignore');
  });
});
