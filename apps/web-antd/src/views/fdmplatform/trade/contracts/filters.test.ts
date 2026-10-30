import { reactive } from 'vue';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  cloneFilters,
  emptyFilters,
  filterQuery,
  loadPresets,
  normalizeFilters,
  savePresets,
  upsertPreset,
} from './filters';

describe('contract board custom filters', () => {
  beforeEach(() => localStorage.clear());

  it('joins multi-select values and drops owners while viewing my contracts', () => {
    const filters = {
      ...emptyFilters(),
      owners: [7, 9],
      companies: [1],
      customers: [{ id: 'c1', name: '客户一' }],
      shipStates: ['NONE', 'PARTIAL'] as const,
      due: ['2026-10-01', '2026-10-31'] as [string, string],
      amountMin: 0,
      kind: 'SAMPLE' as const,
      unpaid: true,
    };
    const query = filterQuery(
      { ...filters, shipStates: [...filters.shipStates] },
      false,
    );
    expect(query).toMatchObject({
      ownerUserIds: '7,9',
      companyIds: '1',
      customerIds: 'c1',
      shipStates: 'NONE,PARTIAL',
      dueFrom: '2026-10-01',
      dueTo: '2026-10-31',
      amountMin: 0,
      sample: true,
      unpaid: true,
    });
    expect(query.buyerUserIds).toBeUndefined();
    expect(
      filterQuery({ ...filters, shipStates: [] }, true).ownerUserIds,
    ).toBeUndefined();
    expect(
      activeFilterCount({ ...filters, shipStates: [...filters.shipStates] }),
    ).toBe(8);
    expect(
      activeFilterCount(
        { ...filters, shipStates: [...filters.shipStates] },
        true,
      ),
    ).toBe(7);
    expect(activeFilterCount(emptyFilters())).toBe(0);
  });

  it('saves presets per channel and user, replaces same-name presets and ignores broken entries', () => {
    const first = upsertPreset([], ' 本月未收款 ', {
      ...emptyFilters(),
      unpaid: true,
    });
    const next = upsertPreset(first, '本月未收款', {
      ...emptyFilters(),
      owners: [3],
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.filters.owners).toEqual([3]);
    expect(savePresets('DOMESTIC', 7, next)).toBe(true);
    expect(loadPresets('DOMESTIC', 7)[0]?.name).toBe('本月未收款');
    expect(loadPresets('FOREIGN', 7)).toEqual([]);
    localStorage.setItem(
      'fdm.contracts.filters.DOMESTIC.8',
      JSON.stringify([
        { name: '', filters: {} },
        { name: '旧', filters: { owners: ['x', 2], shipStates: ['BAD'] } },
      ]),
    );
    expect(loadPresets('DOMESTIC', 8)).toEqual([
      { name: '旧', filters: { ...normalizeFilters({}), owners: [2] } },
    ]);
  });

  it('copies reactive filter state without sharing arrays', () => {
    const state = reactive({ ...emptyFilters(), owners: [1] });
    const copy = cloneFilters(state);
    state.owners.push(2);
    expect(copy.owners).toEqual([1]);
    expect(upsertPreset([], '响应式', state)[0]?.filters.owners).toEqual([
      1, 2,
    ]);
  });
});
