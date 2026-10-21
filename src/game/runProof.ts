/**
 * FNV-1a over the score fields and kick timestamps.
 * `private.run_checksum` in the score-guard migration must stay the same.
 */
export function runChecksum(input: {
  deviceId: string;
  token: string;
  score: number;
  kickCount: number;
  durationMs: number;
  kickTimes: string;
}): string {
  const payload = [
    input.deviceId.toLowerCase(),
    input.token.toLowerCase(),
    String(input.score),
    String(input.kickCount),
    String(input.durationMs),
    input.kickTimes,
  ].join('|');
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function kickTimesText(times: readonly number[]): string {
  return times.map((time) => String(Math.max(0, Math.floor(time)))).join(',');
}
