/**
 * TestFlight installs carry an app receipt whose last path component is
 * `sandboxReceipt`. App Store installs use `receipt`. The same binary is
 * promoted, so this is a runtime check, never a compile-time flag.
 * A missing receipt is not TestFlight.
 */
export const SANDBOX_RECEIPT_NAME = 'sandboxReceipt';

export const TESTER_UNLOCK_NOTE = 'Tester: all outfits unlocked';

export function isTestFlightReceipt(lastPathComponent: string | null | undefined): boolean {
  return lastPathComponent === SANDBOX_RECEIPT_NAME;
}
