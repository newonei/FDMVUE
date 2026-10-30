import { describe, expect, it } from 'vitest';

import { useGridColumns } from './data';
import { createEcInvoiceApplyGridId } from './grid-persistence';

describe('电商发票申请列设置', () => {
  it('按租户和用户隔离保存', () => {
    expect(createEcInvoiceApplyGridId(1, 2)).toBe(
      'fdm-data-ec-invoice-apply-grid--tenant-1--user-2',
    );
    expect(createEcInvoiceApplyGridId(1, 2)).not.toBe(
      createEcInvoiceApplyGridId(1, 3),
    );
    expect(createEcInvoiceApplyGridId(undefined, ' ')).toBe(
      'fdm-data-ec-invoice-apply-grid--tenant-unknown--user-unknown',
    );
  });

  it('数量、付款方税号、创建时间默认显示', () => {
    const columns = useGridColumns() ?? [];
    for (const field of ['quantity', 'payerRegisterNo', 'createTime']) {
      const column = columns.find((c) => c.field === field);
      expect(column, field).toBeDefined();
      expect(column?.visible, field).not.toBe(false);
    }
  });
});
