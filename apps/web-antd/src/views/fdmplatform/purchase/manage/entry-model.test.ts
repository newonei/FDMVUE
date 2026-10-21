import { describe, expect, it } from 'vitest';

import {
  copyEntry,
  emptyRow,
  entryErrors,
  entryPayload,
  entryTotals,
  materialKind,
  parsePastedLines,
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
    ).toEqual({
      lines: '1250.00',
      discounted: '1250.00',
      total: '1275.00',
      count: 2,
    });
    expect(
      entryTotals(rows, {
        discountRate: '95',
        additionalAmount: '30',
        roundOff: '5',
      }).total,
    ).toBe('1212.50');
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

describe('粘贴导入产品明细', () => {
  it('reads code, quantity, price, date and remark from Excel rows', () => {
    const lines = parsePastedLines(
      '产品编号\t数量\t单价\nFL-1\t100\t0.245\t2026-10-20\t黄石付款\nFL-2,5\n\nFL-3\t0\nFL-4\t2\tabc\n\t3',
    );
    expect(lines.map((line) => [line.code, line.quantity, line.error])).toEqual(
      [
        ['FL-1', '100', undefined],
        ['FL-2', '5', undefined],
        ['FL-3', '0', '数量须大于 0'],
        ['FL-4', '2', '单价不是数字'],
        ['', '3', '缺少产品编号'],
      ],
    );
    expect(lines[0]).toMatchObject({
      unitPrice: '0.245',
      arrivalDate: '2026-10-20',
      remark: '黄石付款',
    });
  });

  it('only lets raw materials and accessories go to a receiving factory', () => {
    expect(materialKind('原材料(YC2400000)')).toBe('RAW');
    expect(materialKind('辅料(FL2400000)')).toBe('AUX');
    expect(materialKind('纸箱')).toBe('AUX');
    expect(materialKind('耗材(HC2400000)')).toBeUndefined();
    const lines = [
      row({ category: '原材料', quantity: '1', unitPrice: '1' }),
      {
        ...row({ category: 'TPE瑜伽垫', quantity: '1', unitPrice: '1' }),
        key: 'r2',
      },
    ];
    const header = { companyId: 2, receiveFactoryId: 9, supplierId: 's1' };
    expect(entryErrors(lines, header).lines).toEqual({
      r2: '工厂只收原料、辅料，这一行请另开采购单',
    });
    expect(
      entryErrors(lines, { ...header, receiveFactoryId: undefined }).lines,
    ).toEqual({});
    expect(entryPayload(lines, header, 'k').receiveFactoryId).toBe(9);
  });
});

describe('复制采购单', () => {
  it('带出合同、供应商、表头与明细，采购日期改为今天，到货日期不带', () => {
    let next = 0;
    const { header, rows } = copyEntry(
      {
        contractId: '',
        companyId: 11,
        order: {
          id: 'o1',
          supplierId: 'sup-1',
          companyId: 11,
          receiveFactoryId: 3,
          lines: [
            {
              id: 'l1',
              skuId: 'p1',
              contractItemId: null,
              quantity: 1000,
              unitPrice: 12,
              specificationSnapshot: {
                skuName: '洛阳-POE',
                skuCode: 'YC2400098',
                category: '原材料(YC2400000)',
                unit: 'kg',
              },
            },
            { id: 'l2', skuId: 'p2', quantity: 5, unitPrice: 3 },
            { id: 'l3', quantity: 1, unitPrice: 1 },
          ],
        },
        details: {
          subject: '原材料1',
          category: '原材料',
          purchaseDate: '2026-01-02',
          additionalAmount: 0,
          roundOff: 2,
          discountRate: 100,
          remark: '急单',
          lineDates: { l1: '2026-01-10' },
          lineNotes: { l2: { gift: true, remark: '送样' } },
        },
      } as never,
      () => `k${++next}`,
      '2026-10-21',
    );
    expect(header).toMatchObject({
      supplierId: 'sup-1',
      subject: '原材料1',
      category: '原材料',
      purchaseDate: '2026-10-21',
      companyId: 11,
      receiveFactoryId: 3,
      roundOff: '2',
      remark: '急单',
    });
    expect(header.contractId).toBeUndefined();
    expect(header.additionalAmount).toBeUndefined();
    expect(header.discountRate).toBeUndefined();
    // 没有产品的行不带；到货日期不带
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      productId: 'p1',
      name: '洛阳-POE',
      code: 'YC2400098',
      quantity: '1000',
      unitPrice: '12',
      total: '12000.00',
      gift: false,
    });
    expect(rows[0]!.arrivalDate).toBeUndefined();
    expect(rows[1]).toMatchObject({
      gift: true,
      unitPrice: '0',
      remark: '送样',
    });
  });
});
