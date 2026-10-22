import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SANDBOX_RECEIPT_NAME, TESTER_UNLOCK_NOTE, isTestFlightReceipt } from './testFlight';

describe('TestFlight receipt', () => {
  it('unlocks only when the receipt file is named sandboxReceipt', () => {
    expect(isTestFlightReceipt('sandboxReceipt')).toBe(true);
    expect(isTestFlightReceipt('receipt')).toBe(false);
    expect(isTestFlightReceipt('SandboxReceipt')).toBe(false);
    expect(isTestFlightReceipt(null)).toBe(false);
    expect(isTestFlightReceipt(undefined)).toBe(false);
    expect(isTestFlightReceipt('')).toBe(false);
    expect(TESTER_UNLOCK_NOTE).toBe('Tester: all outfits unlocked');
    expect(SANDBOX_RECEIPT_NAME).toBe('sandboxReceipt');
  });

  it('checks the receipt at runtime in the iOS plugin and does not unlock Android', () => {
    const swift = readFileSync(
      'plugins/kickole-billing/ios/Sources/KickoleBillingPlugin/KickoleBillingPlugin.swift',
      'utf8',
    );
    const java = readFileSync(
      'plugins/kickole-billing/android/src/main/java/com/iqappsgroup/kickole/billing/KickoleBillingPlugin.java',
      'utf8',
    );
    expect(swift).toContain('appStoreReceiptURL?.lastPathComponent');
    expect(swift).toContain('"sandboxReceipt"');
    expect(swift).not.toMatch(/KICKOLE_TESTER|TESTFLIGHT_UNLOCK|SWIFT_ACTIVE_COMPILATION_CONDITIONS/);
    expect(java).toContain('sandboxReceipt');
    expect(java).toMatch(/put\("sandboxReceipt", false\)/);
    expect(java).not.toMatch(/getInstallerPackageName|closedTrack|licenseTesterUnlock/);
    const owned = java.slice(java.indexOf('void ownedProductIds'), java.indexOf('void isSandboxReceipt'));
    expect(owned).toContain('PURCHASED');
    expect(owned).toContain('acknowledge');
    expect(owned).not.toContain('getOrderId');
  });
});