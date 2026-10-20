import { describe, expect, it } from 'vitest';
import { fanLayout } from './fanLayout';
import { footSideAt, replayFresh, type CornerTap } from './restartTap';

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

  it('replays a corner tap only when Play again follows quickly', () => {
    const tap: CornerTap = { side: 'left', at: 1000, pointerId: 3 };
    expect(replayFresh(tap, 1200)).toBe(true);
    expect(replayFresh(tap, 1600)).toBe(false);
    expect(replayFresh(null, 1200)).toBe(false);
  });
});
