/**
 * Quarter-circle fan around each corner kick button.
 * Tricks sit beside the foot (0°), 35° up-and-inward, and straight up (90°).
 * The 0° and 90° radius stops where ATW and GROOVE still clear each other.
 * On a narrow phone the 35° trick steps further out along that ray so its
 * face stays `gap` from the neighbours.
 */

const FAN_RAD = (35 * Math.PI) / 180;
const COS_35 = Math.cos(FAN_RAD);
const SIN_35 = Math.sin(FAN_RAD);

/** Trick chips (HEAD, FLICK, NECK, THIGH, ATW, GROOVE). */
export const FAN_BUTTON = 65;
/** Corner kick faces. Larger than the trick chips, and at least 70. */
export const FOOT_BUTTON = 72;
/** Face gap. The painted ring sits 3px outside the face, so 8px keeps those rings apart. */
export const FAN_GAP = 8;
const MIN_INSET_X = 4;
const BOTTOM_LIFT = 16;
/** Phones in this width keep a side inset and a centre gap so the inner chips stay apart. */
const PHONE_MIN_W = 360;
const PHONE_MAX_W = 430;
const PHONE_INSET_X = 8;
const PHONE_MIDDLE = 8;

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
  const middle = phone ? PHONE_MIDDLE : gap;
  const dMax = (width - insetLeft - insetRight - button * 2 - middle) / 2;
  // Open the fan until ATW and GROOVE keep `middle` between them. On a narrow
  // phone that radius is shorter than the 35° chord, so the diagonal trick
  // steps out along the same ray until it clears its two neighbours.
  const d = Math.max(0, dMax);
  const maxDx = (width - insetLeft - insetRight - button * 2 - gap) / 2;
  const diag = diagonalRadius(d, button, gap, Math.max(d, maxDx / COS_35));
  const dx = diag * COS_35;
  const dy = diag * SIN_35;
  return { button, insetLeft, insetRight, insetBottom, d, dx, dy };
}

/** Radius along the 35° ray. Grows past `d` until the chord gap is `gap`, and stops before the two diagonals meet. */
function diagonalRadius(d: number, button: number, gap: number, limit: number): number {
  const faceGap = (radius: number) => Math.hypot(radius * COS_35 - d, radius * SIN_35) - button;
  const cap = Math.max(d, limit);
  if (faceGap(d) >= gap || cap <= d) return d;
  let lo = d;
  let hi = cap;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (faceGap(mid) >= gap) hi = mid;
    else lo = mid;
  }
  return hi;
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
 * Trick chips stay on the fan radius. L and R grow from the same corner
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
