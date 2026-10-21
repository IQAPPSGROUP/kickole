import { describe, expect, it } from 'vitest';
import { FAN_BUTTON, FOOT_BUTTON, circleGap, fanLayout, fanRects } from './fanLayout';

function nearestGap(width: number, height: number, safeLeft = 0, safeRight = 0, safeBottom = 0) {
  const layout = fanLayout(width, safeLeft, safeRight, safeBottom);
  const rects = fanRects(width, height, layout);
  let nearest = Infinity;
  let pair = '';
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const gap = circleGap(rects[i], rects[j]);
      if (gap < nearest) {
        nearest = gap;
        pair = `${rects[i].name}/${rects[j].name}`;
      }
    }
  }
  return { layout, rects, nearest, pair };
}

describe('corner fan', () => {
  it('puts HEAD above, NECK at 35°, and ATW beside the left foot', () => {
    const { layout, rects } = nearestGap(375, 667);
    const byName = Object.fromEntries(rects.map((rect) => [rect.name, rect]));
    expect(byName.head.x).toBeCloseTo(byName.left.x, 4);
    expect(byName.head.y).toBeLessThan(byName.left.y);
    expect(byName.atw.y + byName.atw.h).toBeCloseTo(byName.left.y + byName.left.h, 4);
    expect(byName.atw.x).toBeGreaterThan(byName.left.x);
    const angle = Math.atan2(layout.dy, layout.dx) * (180 / Math.PI);
    expect(angle).toBeCloseTo(35, 4);
    expect(Math.hypot(layout.dx, layout.dy)).toBeGreaterThanOrEqual(layout.d - 0.01);
    expect(byName.neck.y).toBeGreaterThan(byName.head.y + 24);
    expect(byName.neck.y).toBeLessThan(byName.left.y - 24);
    expect(byName.thigh.y).toBeGreaterThan(byName.flick.y + 24);
    expect(byName.thigh.y).toBeLessThan(byName.right.y - 24);
    expect(byName.flick.x + byName.flick.w).toBeCloseTo(byName.right.x + byName.right.w, 4);
    expect(byName.groove.y + byName.groove.h).toBeCloseTo(byName.right.y + byName.right.h, 4);
    expect(byName.thigh.x).toBeLessThan(byName.right.x);
  });

  it('keeps the fan buttons from overlapping on a 375x667 phone and a large phone', () => {
    for (const [width, height] of [[360, 740], [375, 667], [390, 844], [430, 932]] as const) {
      const { nearest, pair, rects } = nearestGap(width, height);
      expect(nearest, `${width} ${pair}`).toBeGreaterThanOrEqual(6);
      const byName = Object.fromEntries(rects.map((rect) => [rect.name, rect]));
      expect(byName.left.w).toBe(FOOT_BUTTON);
      expect(byName.right.w).toBe(FOOT_BUTTON);
      expect(FAN_BUTTON).toBeGreaterThanOrEqual(64);
      expect(FAN_BUTTON).toBeLessThanOrEqual(66);
      expect(FOOT_BUTTON).toBeGreaterThanOrEqual(70);
      expect(FOOT_BUTTON).toBeGreaterThan(FAN_BUTTON);
      for (const name of ['head', 'neck', 'atw', 'flick', 'thigh', 'groove']) {
        expect(byName[name].w, name).toBe(FAN_BUTTON);
      }
    }
  });

  it('insets 360–430px phones so GROOVE clears ATW and RIGHT stays on screen', () => {
    for (const width of [360, 375, 390, 414, 430]) {
      const { layout, rects } = nearestGap(width, 800);
      const byName = Object.fromEntries(rects.map((rect) => [rect.name, rect]));
      expect(layout.insetLeft, `${width} left`).toBeGreaterThanOrEqual(8);
      expect(layout.insetRight, `${width} right`).toBeGreaterThanOrEqual(8);
      expect(byName.right.x + byName.right.w, `${width} right edge`).toBeLessThanOrEqual(width - 8);
      expect(circleGap(byName.atw, byName.groove), `${width} atw/groove`).toBeGreaterThanOrEqual(6);
      expect(layout.insetBottom, `${width} bottom`).toBe(16);
      expect(byName.left.y + byName.left.h, `${width} bottom edge`).toBeLessThanOrEqual(800 - 16);
    }
    const narrow = fanLayout(320);
    const wide = fanLayout(500);
    expect(narrow.insetLeft).toBe(4);
    expect(wide.insetRight).toBe(4);
  });

  it('keeps the fan inside the screen when the safe area grows', () => {
    const { layout, rects, nearest } = nearestGap(390, 844, 12, 12, 34);
    expect(layout.insetBottom).toBe(34 + 16);
    expect(nearest).toBeGreaterThanOrEqual(6);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(12);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(390 - 12);
      expect(rect.y + rect.h).toBeLessThanOrEqual(844 - 34);
    }
  });
});
