import { gradeDisplayColor } from './presentation';

/** AgX exposure. Faces stay lit by the fill, so this stays near 1.3 instead of washing the frame. */
export const STREET_EXPOSURE = 1.3;

export const STREET_KEY = { color: '#fff4e2', intensity: 3.15 };
export const STREET_HEMI = { sky: '#fff1d4', ground: '#c8966a', intensity: 0.85 };
export const STREET_FILL = { color: '#ffe3bf', intensity: 1.25 };
export const STREET_ENV_INTENSITY = 0.62;
/** Tight enough that white court lines stay paint, not a halo. */
export const STREET_BLOOM = { strength: 0.05, threshold: 3.4 };
export const STREET_HDR_URL = 'textures/street_day_1k.hdr';

type RGB = [number, number, number];

const SRGB_TO_REC2020: RGB[] = [
  [0.6274, 0.0691, 0.0164],
  [0.3293, 0.9195, 0.088],
  [0.0433, 0.0113, 0.8956],
];

const REC2020_TO_SRGB: RGB[] = [
  [1.6605, -0.1246, -0.0182],
  [-0.5876, 1.1329, -0.1006],
  [-0.0728, -0.0083, 1.1187],
];

const AGX_INSET: RGB[] = [
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
];

const AGX_OUTSET: RGB[] = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
];

const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

function mul(columns: RGB[], v: RGB): RGB {
  return [
    columns[0][0] * v[0] + columns[1][0] * v[1] + columns[2][0] * v[2],
    columns[0][1] * v[0] + columns[1][1] * v[1] + columns[2][1] * v[2],
    columns[0][2] * v[0] + columns[1][2] * v[1] + columns[2][2] * v[2],
  ];
}

function agxContrast(x: number): number {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

/** three r186 AgX, including exposure. Input and output are linear sRGB. */
export function agxToneMap(r: number, g: number, b: number, exposure = STREET_EXPOSURE): RGB {
  let color = mul(SRGB_TO_REC2020, [r * exposure, g * exposure, b * exposure]);
  color = mul(AGX_INSET, color);
  color = color.map((channel) => {
    const encoded = (Math.log2(Math.max(channel, 1e-10)) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
    return agxContrast(Math.min(1, Math.max(0, encoded)));
  }) as RGB;
  color = mul(AGX_OUTSET, color);
  color = color.map((channel) => Math.pow(Math.max(0, channel), 2.2)) as RGB;
  color = mul(REC2020_TO_SRGB, color);
  return [
    Math.min(1, Math.max(0, color[0])),
    Math.min(1, Math.max(0, color[1])),
    Math.min(1, Math.max(0, color[2])),
  ];
}

export function displayLuminance(linear: RGB): number {
  const mapped = agxToneMap(linear[0], linear[1], linear[2]);
  const [r, g, b] = gradeDisplayColor(mapped[0], mapped[1], mapped[2]);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function srgbByte(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
}

function linearFromHex(hex: string): RGB {
  return [0, 1, 2].map((index) => {
    const encoded = srgbByte(hex, index);
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  }) as RGB;
}

export interface ShadeWeights {
  key: number;
  fill: number;
  hemi: number;
  env: number;
}

/** Lambert street shade using the same light intensities the canvas installs. */
export function shadeStreet(albedo: RGB, weights: ShadeWeights): RGB {
  const key = linearFromHex(STREET_KEY.color);
  const fill = linearFromHex(STREET_FILL.color);
  const sky = linearFromHex(STREET_HEMI.sky);
  const ground = linearFromHex(STREET_HEMI.ground);
  const hemi: RGB = [
    ground[0] + (sky[0] - ground[0]) * 0.72,
    ground[1] + (sky[1] - ground[1]) * 0.72,
    ground[2] + (sky[2] - ground[2]) * 0.72,
  ];
  const env: RGB = [1.2, 1.32, 1.5];
  return [0, 1, 2].map((index) => albedo[index] * (
    key[index] * STREET_KEY.intensity * weights.key
    + fill[index] * STREET_FILL.intensity * weights.fill
    + hemi[index] * STREET_HEMI.intensity * weights.hemi
    + env[index] * STREET_ENV_INTENSITY * weights.env
  )) as RGB;
}

const SKIN: RGB = [0.58, 0.36, 0.27];
const COURT: RGB = [0.46, 0.43, 0.38];

/** Sunlit face, shadow-side face, court, and open sky. Sky matches the sunny HDR. */
export function streetDaylightSamples(): { sunlit: RGB; shadow: RGB; court: RGB; sky: RGB } {
  return {
    sunlit: shadeStreet(SKIN, { key: 0.7, fill: 0.2, hemi: 0.58, env: 0.5 }),
    shadow: shadeStreet(SKIN, { key: 0, fill: 0.5, hemi: 0.72, env: 0.42 }),
    court: shadeStreet(COURT, { key: 0.82, fill: 0.16, hemi: 0.48, env: 0.32 }),
    sky: [1.45, 1.7, 2.05],
  };
}

export function meanStreetLuminance(samples = streetDaylightSamples()): number {
  const values = [samples.sunlit, samples.shadow, samples.court, samples.sky].map(displayLuminance);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type StreetPassName = 'beauty' | 'ssao' | 'bloom' | 'dof' | 'agx' | 'grade' | 'smaa' | 'fxaa';

/** Bloom and depth of field stay in linear light. AgX, then the grade, then anti-aliasing. */
export function streetPostPassNames(profile: {
  ssao: boolean;
  bloom: boolean;
  dof: boolean;
  aa: 'none' | 'fxaa' | 'smaa';
}): StreetPassName[] {
  const names: StreetPassName[] = ['beauty'];
  if (profile.ssao) names.push('ssao');
  if (profile.bloom) names.push('bloom');
  if (profile.dof) names.push('dof');
  names.push('agx', 'grade');
  if (profile.aa === 'smaa') names.push('smaa');
  else if (profile.aa === 'fxaa') names.push('fxaa');
  return names;
}
