import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  LEGACY_TRADE_PROTOTYPE_STORAGE_KEY,
  TRADE_PROTOTYPE_STORAGE_KEY,
} from './migration';
import { useTradePrototypeStore } from './store';

describe('foreign-trade prototype Pinia store', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it('migrates a v1 session into v2 and leaves the legacy key intact', async () => {
    const legacy = {
      customers: [
        {
          code: 'FT-CUS-V1',
          contact: 'Legacy Contact',
          id: 'CUS-V1',
          name: 'Legacy Customer',
          syncStatus: '已同步',
        },
      ],
      demandLines: [],
      okkiCustomers: [],
      orders: [],
      receipts: [],
      writeOffItems: [],
    };
    const serializedLegacy = JSON.stringify(legacy);
    sessionStorage.setItem(
      LEGACY_TRADE_PROTOTYPE_STORAGE_KEY,
      serializedLegacy,
    );

    const store = useTradePrototypeStore();
    await store.initialize();

    expect(store.initialized).toBe(true);
    expect(store.state.schemaVersion).toBe(2);
    expect(store.state.customers[0]?.id).toBe('CUS-V1');
    expect(sessionStorage.getItem(TRADE_PROTOTYPE_STORAGE_KEY)).toBeTruthy();
    expect(sessionStorage.getItem(LEGACY_TRADE_PROTOTYPE_STORAGE_KEY)).toBe(
      serializedLegacy,
    );
  });

  it('tolerates malformed v2 and v1 storage', async () => {
    sessionStorage.setItem(TRADE_PROTOTYPE_STORAGE_KEY, '{not-json');
    sessionStorage.setItem(LEGACY_TRADE_PROTOTYPE_STORAGE_KEY, 'also-not-json');

    const store = useTradePrototypeStore();
    await expect(store.initialize()).resolves.toMatchObject({
      schemaVersion: 2,
    });
    expect(store.error).toBeNull();
    expect(store.state.orders.length).toBeGreaterThan(0);
  });

  it('persists gateway mutations explicitly through the store', async () => {
    const store = useTradePrototypeStore();
    await store.initialize();
    await store.updateFactoryTaskProgress('FT-202607-011', '2000', '王工');

    const persisted = JSON.parse(
      sessionStorage.getItem(TRADE_PROTOTYPE_STORAGE_KEY) ?? '{}',
    ) as { factoryTasks?: Array<{ completedQty: string; id: string }> };
    expect(
      persisted.factoryTasks?.find((task) => task.id === 'FT-202607-011')
        ?.completedQty,
    ).toBe('2000');
  });

  it('resets only the v2 key and never removes the v1 snapshot', async () => {
    const legacySentinel = 'legacy-sentinel-that-must-survive-reset';
    sessionStorage.setItem(LEGACY_TRADE_PROTOTYPE_STORAGE_KEY, legacySentinel);
    const store = useTradePrototypeStore();
    await store.initialize();
    await store.updateFactoryTaskProgress('FT-202607-011', '2000');
    await store.reset();

    expect(sessionStorage.getItem(LEGACY_TRADE_PROTOTYPE_STORAGE_KEY)).toBe(
      legacySentinel,
    );
    const resetSnapshot = JSON.parse(
      sessionStorage.getItem(TRADE_PROTOTYPE_STORAGE_KEY) ?? '{}',
    ) as { factoryTasks?: Array<{ completedQty: string; id: string }> };
    expect(
      resetSnapshot.factoryTasks?.find((task) => task.id === 'FT-202607-011')
        ?.completedQty,
    ).toBe('1800');
  });
});
