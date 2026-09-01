import { describe, expect, it } from 'vitest';

import { useGridColumns } from './data';
import {
  createPatternDesignItemGridId,
  PATTERN_DESIGN_ITEM_GRID_CUSTOM_CONFIG,
} from './grid-persistence';

describe('pattern design item grid persistence', () => {
  it('enables immediate local persistence', () => {
    expect(PATTERN_DESIGN_ITEM_GRID_CUSTOM_CONFIG).toEqual({
      immediate: true,
      storage: true,
    });
  });

  it('isolates the storage namespace by tenant and user', () => {
    const firstUserId = createPatternDesignItemGridId(1, 10);

    expect(firstUserId).toBe(
      'fdm-neixiao-pattern-design-item-grid--tenant-1--user-10',
    );
    expect(createPatternDesignItemGridId(1, 11)).not.toBe(firstUserId);
    expect(createPatternDesignItemGridId(2, 10)).not.toBe(firstUserId);
  });

  it('gives every persisted column a stable key', () => {
    const columns = useGridColumns() ?? [];
    const columnsWithoutKey = columns.filter(
      (column) => !column.field && !column.type,
    );

    expect(columnsWithoutKey).toEqual([]);
  });
});
