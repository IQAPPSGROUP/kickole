/** Corner fan for the two foot buttons and six tricks. */

const FAN_RAD = (35 * Math.PI) / 180;
/** Centre distance along 35° is chosen so that button just clears the horizontal neighbour. */
const DX_PER_D = 2 * Math.cos(FAN_RAD) * Math.cos(FAN_RAD);
const TAN_35 = Math.tan(FAN_RAD);

export const FAN_BUTTON = 72;
export const FAN_GAP = 8;
const MIN_INSET_X = 4;
const MIN_INSET_BOTTOM = 8;

export interface FanLayout {
  button: number;
  insetLeft: number;
  insetRight: number;
  insetBottom: number;
  /** Centre distance from the foot button to the horizontal and vertical tricks. */
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
  const insetLeft = Math.max(MIN_INSET_X, safeLeft);
  const insetRight = Math.max(MIN_INSET_X, safeRight);
  const insetBottom = Math.max(MIN_INSET_BOTTOM, safeBottom);
  const dIdeal = button + gap;
  const dxIdeal = dIdeal * DX_PER_D;
  const dxMax = (width - insetLeft - insetRight - button * 2 - gap) / 2;
  const dx = Math.min(dxIdeal, Math.max(0, dxMax));
  const d = dx / DX_PER_D;
  const dy = dx * TAN_35;
  return { button, insetLeft, insetRight, insetBottom, d, dx, dy };
}

export interface FanRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Screen rects, origin at the top-left, for overlap checks. */
export function fanRects(width: number, height: number, layout: FanLayout): FanRect[] {
  const { button: b, insetLeft: left, insetRight: right, insetBottom: bottom, d, dx, dy } = layout;
  const yFoot = height - bottom - b;
  const xRight = width - right - b;
  return [
    { name: 'left', x: left, y: yFoot, w: b, h: b },
    { name: 'atw', x: left + d, y: yFoot, w: b, h: b },
    { name: 'head', x: left, y: yFoot - d, w: b, h: b },
    { name: 'neck', x: left + dx, y: yFoot - dy, w: b, h: b },
    { name: 'right', x: xRight, y: yFoot, w: b, h: b },
    { name: 'groove', x: xRight - d, y: yFoot, w: b, h: b },
    { name: 'flick', x: xRight, y: yFoot - d, w: b, h: b },
    { name: 'thigh', x: xRight - dx, y: yFoot - dy, w: b, h: b },
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
