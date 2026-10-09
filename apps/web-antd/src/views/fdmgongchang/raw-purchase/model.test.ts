import type { FdmgongchangRawPurchaseApi as Api } from '#/api/fdmgongchang/raw-purchase';

import { describe, expect, it } from 'vitest';

import {
  draftTotal,
  formatMoney,
  isClosable,
  isUntouched,
  lineAmount,
  newDraftLine,
  validateDraft,
} from './model';

const purchase = (status: Api.Status, received: number[]): Pick<Api.Purchase, 'lines' | 'status'> => ({
  lines: received.map((r, i) => ({
    amount: 0,
    id: i,
    quantity: 100,
    rawMaterialCode: `M${i}`,
    rawMaterialName: `M${i}`,
    receivedQuantity: r,
    remainingQuantity: 100 - r,
    unitPrice: 1,
  })),
  status,
});

describe('raw purchase model', () => {
  it('rounds line amounts to cents like the backend and totals them', () => {
    expect(lineAmount({ quantity: 20.5, unitPrice: 8.3333 })).toBe(170.83);
    expect(lineAmount({ quantity: 10 })).toBe(0);
    const lines = [
      newDraftLine({ quantity: 1000, unitPrice: 12.5 }),
      newDraftLine({ quantity: 20.5, unitPrice: 8.3333 }),
    ];
    expect(draftTotal(lines)).toBe(12_670.83);
    expect(formatMoney(12_670.83)).toBe('12,670.83');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('lists every problem in a draft before sending it', () => {
    const nameOf = (code: string) => ({ 'MAT-TPE': 'TPE粒子' })[code] ?? code;
    expect(validateDraft({ lines: [], nameOf })).toEqual(['请选择供应商。', '请至少添加一种原材料。']);
    expect(
      validateDraft({
        lines: [
          newDraftLine({ quantity: 10, rawMaterialCode: 'MAT-TPE', unitPrice: 0 }),
          newDraftLine({ quantity: 0, rawMaterialCode: 'MAT-TPE' }),
          newDraftLine(),
        ],
        nameOf,
        supplierId: 's1',
      }),
    ).toEqual([
      'TPE粒子重复了，请合并成一行。',
      '第 2 行请填写大于 0 的采购数量。',
      '第 2 行请填写单价（可以为 0）。',
      '第 3 行请选择原材料。',
    ]);
  });

  it('allows edit or cancel only before any arrival, and close only after a partial arrival', () => {
    expect(isUntouched(purchase('ORDERED', [0, 0]))).toBe(true);
    expect(isUntouched(purchase('PARTIAL', [10, 0]))).toBe(false);
    expect(isUntouched(purchase('CANCELLED', [0]))).toBe(false);
    expect(isClosable(purchase('PARTIAL', [10]))).toBe(true);
    expect(isClosable(purchase('ORDERED', [0]))).toBe(false);
    expect(isClosable(purchase('RECEIVED', [100]))).toBe(false);
  });
});
