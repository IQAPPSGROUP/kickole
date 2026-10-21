/**
 * Quarter-circle fan around each corner kick button.
 * The three tricks sit on one radius: beside (0°), 35° up-and-inward, and straight up (90°).
 * The radius is the chord that keeps the 0° and 35° faces `gap` apart, capped so the two
 * inner tricks still clear each other on a phone.
 */

const FAN_RAD = (35 * Math.PI) / 180;
const COS_35 = Math.cos(FAN_RAD);
const SIN_35 = Math.sin(FAN_RAD);
const CHORD_35 = 2 * Math.sin(FAN_RAD / 2);

export const FAN_BUTTON = 52;
/** Corner kick faces, about 1.35× the trick chips. */
export const FOOT_BUTTON = 70;
export const FAN_GAP = 6;
const MIN_INSET_X = 4;
const BOTTOM_LIFT = 16;
/** Phones in this width keep a side safe inset and a centre gap so the inner chips and the R label stay on screen. */
const PHONE_MIN_W = 360;
const PHONE_MAX_W = 430;
const PHONE_INSET_X = 16;
const PHONE_MIDDLE = 28;

export interface FanLayout {
  button: number;
  insetLeft: number;
  insetRight: number;
  insetBottom: number;
  /** Centre distance from the corner origin to the horizontal and vertical tricks. */
  d: number;
  /** Inward offset of the 35° trick. */
  dx: number;
  /** Upward offset of the 35° trick. */
  dy: number;
}

export function fanLayout(
  width: number,
  safeLeft = 0,
  safeRight = 0,
  safeBottom = 0,
  button = FAN_BUTTON,
  gap = FAN_GAP,
): FanLayout {
  const phone = width >= PHONE_MIN_W && width <= PHONE_MAX_W;
  const insetLeft = Math.max(phone ? PHONE_INSET_X : MIN_INSET_X, safeLeft);
  const insetRight = Math.max(phone ? PHONE_INSET_X : MIN_INSET_X, safeRight);
  const insetBottom = safeBottom + BOTTOM_LIFT;
  const dClear = (button + gap) / CHORD_35;
  const middle = phone ? PHONE_MIDDLE : gap;
  const dMax = (width - insetLeft - insetRight - button * 2 - middle) / 2;
  // Largest radius that still keeps the two inner tricks apart. The minimum
  // chord packs the 35° trick against the top button, so the fan reads as two rows.
  const d = dMax >= dClear ? dMax : Math.max(dClear, button + gap);
  const dx = d * COS_35;
  const dy = d * SIN_35;
  return { button, insetLeft, insetRight, insetBottom, d, dx, dy };
}

export interface FanRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Screen rects, origin at the top-left, for overlap checks.
 * Trick chips stay on the 52px fan. L and R grow from the same corner
 * (left/bottom or right/bottom), so they stay inside the safe inset.
 */
export function fanRects(width: number, height: number, layout: FanLayout): FanRect[] {
  const { button: b, insetLeft: left, insetRight: right, insetBottom: bottom, d, dx, dy } = layout;
  const foot = FOOT_BUTTON;
  const yBase = height - bottom;
  const xRight = width - right;
  return [
    { name: 'left', x: left, y: yBase - foot, w: foot, h: foot },
    { name: 'atw', x: left + d, y: yBase - b, w: b, h: b },
    { name: 'head', x: left, y: yBase - d - b, w: b, h: b },
    { name: 'neck', x: left + dx, y: yBase - dy - b, w: b, h: b },
    { name: 'right', x: xRight - foot, y: yBase - foot, w: foot, h: foot },
    { name: 'groove', x: xRight - b - d, y: yBase - b, w: b, h: b },
    { name: 'flick', x: xRight - b, y: yBase - d - b, w: b, h: b },
    { name: 'thigh', x: xRight - b - dx, y: yBase - dy - b, w: b, h: b },
  ];
}

/** Space between the circular faces. Border-radius makes the hit target a circle. */
export function circleGap(a: FanRect, b: FanRect): number {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by) - (a.w + b.w) / 2;
}
