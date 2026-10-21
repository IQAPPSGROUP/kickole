import { describe, expect, it } from 'vitest';
import {
  BLOCK_CONFIRMATION,
  DONE_CONFIRMATION,
  REPORT_PRIVACY_LINE,
  REPORT_REASONS,
  REPORT_THANKS,
  isReportReason,
} from './reportReasons';

describe('report reasons', () => {
  it('keeps the three player-facing reasons and the confirmation lines', () => {
    expect(REPORT_REASONS.map((item) => item.label)).toEqual([
      'Rude or mean name',
      'Pretending to be someone',
      'Something else',
    ]);
    expect(REPORT_REASONS.map((item) => item.code)).toEqual(['rude', 'impersonation', 'other']);
    expect(REPORT_PRIVACY_LINE).toBe("They won't be told you reported them.");
    expect(REPORT_THANKS).toBe("Thanks. We'll check it. Hidden for you now. If something upsets you, tell an adult you trust.");
    expect(BLOCK_CONFIRMATION).toBe('Blocked. Hidden on this device.');
    expect(DONE_CONFIRMATION).toBe('Done');
    expect(isReportReason('rude')).toBe(true);
    expect(isReportReason('player_report')).toBe(false);
    expect(isReportReason(null)).toBe(false);
  });
});
