/** Closed list stored on `private.reports.reason`. Labels are the player-facing words. */
export const REPORT_REASONS = [
  { code: 'rude', label: 'Rude or mean name' },
  { code: 'impersonation', label: 'Pretending to be someone' },
  { code: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['code'];

export const REPORT_PRIVACY_LINE = "They won't be told you reported them.";

export const REPORT_THANKS =
  "Thanks. We'll check it. Hidden for you now. If something upsets you, tell an adult you trust.";

export const BLOCK_CONFIRMATION = 'Blocked. Hidden on this device.';

export const DONE_CONFIRMATION = 'Done';

export function isReportReason(value: unknown): value is ReportReason {
  switch (value) {
    case 'rude':
    case 'impersonation':
    case 'other':
      return true;
    default:
      return false;
  }
}
