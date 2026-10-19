import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import type { EntitlementSnapshot } from './types';
import type { WardrobeLocker } from '../game/shop';

/**
 * Loads the billing modules through a real `vite build` (production),
 * which is what `npm run ios:sync` copies into the TestFlight app.
 */
interface ReleaseBilling {
  BrowserBillingAdapter: new () => {
    purchaseLaunchCollection(): Promise<{
      outcome: string;
      entitlement: EntitlementSnapshot;
    }>;
    restorePurchases(): Promise<{
      outcome: string;
      entitlement: EntitlementSnapshot;
    }>;
  };
  PurchaseService: new (adapter: InstanceType<ReleaseBilling['BrowserBillingAdapter']>) => {
    purchase(locker: WardrobeLocker): Promise<{
      result: { outcome: string };
      locker: WardrobeLocker;
    }>;
  };
  applyEntitlementSnapshot(
    locker: WardrobeLocker,
    snapshot: EntitlementSnapshot,
    platform: 'web' | 'ios' | 'android',
  ): WardrobeLocker;
  normalizeLocker(raw: {
    launchCollectionOwned?: boolean;
    entitlementSource?: string;
    entitlementVerifiedAt?: number;
    entitlementTransactionRef?: string | null;
    launchGrantedItemIds?: string[];
    wardrobeVersion?: number;
  }): WardrobeLocker;
  applyLaunchCollection(locker: WardrobeLocker): WardrobeLocker;
  grantLaunchCollection(
    locker: WardrobeLocker,
    source: 'dev_sim',
    transactionRef: string | null,
    verifiedAt?: number,
  ): WardrobeLocker;
}

let release: ReleaseBilling;
let outDir = '';

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'kickole-release-'));
  // Vitest sets NODE_ENV=test. `vite build` only drops dev simulation when this is production,
  // which is what `npm run ios:sync` does before copying assets into the iOS app.
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({
      configFile: false,
      mode: 'production',
      logLevel: 'silent',
      build: {
        outDir,
        emptyOutDir: true,
        lib: {
          entry: path.resolve('src/billing/releaseBundleEntry.ts'),
          formats: ['es'],
          fileName: 'billing',
        },
        rollupOptions: {
          external: [/^@capacitor\//],
        },
      },
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
  const source = await readFile(path.join(outDir, 'billing.js'), 'utf8');
  if (source.includes('simPurchase') || source.includes('Development simulation')) {
    throw new Error('Production billing bundle still contains the dev purchase simulation.');
  }
  release = await import(pathToFileURL(path.join(outDir, 'billing.js')).href) as ReleaseBilling;
}, 30_000);

afterAll(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe('release build purchase simulation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function armSimPurchaseQuery() {
    vi.stubGlobal('window', { location: { search: '?simPurchase=1' } });
  }

  it('does not grant ownership for ?simPurchase=1', async () => {
    armSimPurchaseQuery();
    const adapter = new release.BrowserBillingAdapter();
    const purchased = await adapter.purchaseLaunchCollection();
    expect(purchased.outcome).toBe('unavailable');
    expect(purchased.entitlement.owned).toBe(false);
    expect(purchased.entitlement.source).not.toBe('dev_sim');

    const restored = await adapter.restorePurchases();
    expect(restored.outcome).toBe('unavailable');
    expect(restored.entitlement.owned).toBe(false);

    const service = new release.PurchaseService(adapter);
    const { result, locker } = await service.purchase(release.normalizeLocker({}));
    expect(result.outcome).toBe('unavailable');
    expect(locker.launchCollectionOwned).toBe(false);
    expect(locker.entitlementSource).toBe('none');
  });

  it('ignores a saved dev_sim locker', () => {
    const locker = release.normalizeLocker({
      launchCollectionOwned: true,
      entitlementSource: 'dev_sim',
      entitlementVerifiedAt: 10,
      entitlementTransactionRef: 'dev:kickole_launch_collection',
      launchGrantedItemIds: ['boot-gold'],
      wardrobeVersion: 2,
    });
    expect(locker.launchCollectionOwned).toBe(false);
    expect(locker.entitlementSource).toBe('none');
    expect(locker.ownedBoots).toEqual(['boot-street-classic']);
  });

  it('strips a dev_sim snapshot instead of granting it', () => {
    const start = release.normalizeLocker({});
    const granted = release.applyEntitlementSnapshot(start, {
      owned: true,
      source: 'dev_sim',
      verifiedAt: 20,
      transactionRef: 'dev:kickole_launch_collection',
    }, 'ios');
    expect(granted.launchCollectionOwned).toBe(false);
    expect(granted.entitlementSource).toBe('none');

    const simulated = release.grantLaunchCollection(start, 'dev_sim', 'dev:kickole_launch_collection', 10);
    expect(simulated.launchCollectionOwned).toBe(true);
    const stripped = release.applyEntitlementSnapshot(simulated, {
      owned: true,
      source: 'dev_sim',
      verifiedAt: 11,
      transactionRef: 'dev:kickole_launch_collection',
    }, 'ios');
    expect(stripped.launchCollectionOwned).toBe(false);
    expect(stripped.entitlementSource).toBe('none');
  });

  it('does not let the deprecated dev helper grant the collection', () => {
    const locker = release.applyLaunchCollection(release.normalizeLocker({}));
    expect(locker.launchCollectionOwned).toBe(false);
    expect(locker.entitlementSource).toBe('none');
  });
});
