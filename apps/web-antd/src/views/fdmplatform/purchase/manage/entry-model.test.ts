import { describe, expect, it } from 'vitest';

import {
  emptyRow,
  entryErrors,
  entryPayload,
  entryTotals,
  setRowGift,
  setRowPrice,
  setRowQuantity,
  setRowTotal,
} from './entry-model';

function row(extra = {}) {
  return { ...emptyRow('r1'), productId: 'p1', name: '色料', ...extra };
}

describe('新建采购单表单', () => {
  it('keeps unit price, quantity and total in step', () => {
    const line = row();
    setRowQuantity(line, '100');
    setRowPrice(line, '12.5');
    expect(line.total).toBe('1250.00');
    setRowTotal(line, '1000');
    expect(line.unitPrice).toBe('10');
    setRowQuantity(line, '50');
    expect(line.total).toBe('500.00');
    setRowGift(line, true);
    expect([line.unitPrice, line.total]).toEqual(['0', '0.00']);
  });

  it('totals lines, adds fees and subtracts the round-off like 金智', () => {
    const rows = [
      row({ quantity: '100', unitPrice: '12.5' }),
      row({ key: 'r2', quantity: '1', unitPrice: '0', gift: true }),
    ];
    expect(
      entryTotals(rows, { additionalAmount: '30', roundOff: '5' }),
    ).toEqual({ lines: '1250.00', total: '1275.00', count: 2 });
  });

  it('needs supplier, company without a contract, product and quantity', () => {
    const rows = [row({ productId: undefined }), row({ key: 'r2' })];
    const errors = entryErrors(rows, {});
    expect(errors.sheet).toBe('请选择供应商');
    expect(errors.lines).toEqual({ r1: '请选择产品', r2: '数量须大于 0' });
    expect(entryErrors(rows, { supplierId: 's' }).sheet).toBe('请选择所属公司');
    expect(entryErrors(rows, { supplierId: 's', contractId: 'c' }).sheet).toBe(
      '',
    );
  });

  it('sends contract products by item and others by product', () => {
    const payload = entryPayload(
      [
        row({
          contractItemId: 'item-1',
          productId: 'p1',
          quantity: '5',
          unitPrice: '10',
        }),
        row({
          key: 'r2',
          quantity: '2',
          unitPrice: '3',
          gift: true,
          remark: ' 随货 ',
        }),
      ],
      { supplierId: 's', contractId: 'c', additionalAmount: '' },
      'key-123456',
    );
    expect(payload.lines).toEqual([
      expect.objectContaining({
        contractItemId: 'item-1',
        productId: undefined,
      }),
      expect.objectContaining({
        productId: 'p1',
        unitPrice: '0',
        gift: true,
        remark: '随货',
      }),
    ]);
    expect(payload.additionalAmount).toBeUndefined();
  });
});
