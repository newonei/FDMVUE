import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadContractRelatedDocs } from './contract-related-docs';

const mocks = vi.hoisted(() => ({
  business: vi.fn(),
  finance: vi.fn(),
  stockIns: vi.fn(),
  stockOuts: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({ getBusinessPage: mocks.business }));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinancePage: mocks.finance,
}));
vi.mock('#/api/fdmplatform/warehouse', () => ({
  getStockIns: mocks.stockIns,
  getStockOuts: mocks.stockOuts,
}));

const empty = { list: [], total: 0 };

describe('loadContractRelatedDocs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.business.mockResolvedValue(empty);
    mocks.finance.mockResolvedValue(empty);
    mocks.stockIns.mockResolvedValue(empty);
    mocks.stockOuts.mockResolvedValue(empty);
  });

  it('只返回有单据的类型，按业务先后排列', async () => {
    mocks.business.mockImplementation((resource: string) =>
      resource === 'purchase-orders'
        ? Promise.resolve({
            list: [
              {
                id: 'o1',
                code: 'PO-1',
                contractId: 'c1',
                record: { supplierName: '甲厂', status: 'CANCELLED' },
              },
            ],
            total: 1,
          })
        : Promise.resolve(empty),
    );
    mocks.stockIns.mockResolvedValue({
      list: [
        {
          id: 'i1',
          code: 'RK-1',
          status: 'RECEIVED',
          warehouseName: '主仓',
          supplierName: '甲厂',
          lines: [{ productName: '瑜伽垫' }],
          receivedDate: '2026-10-01',
        },
      ],
      total: 1,
    });
    mocks.finance.mockImplementation(({ type }: { type: string }) =>
      type === 'REIMBURSEMENT'
        ? Promise.resolve({
            list: [
              {
                id: 'f1',
                code: 'BX-1',
                name: '快递费',
                amount: '10',
                currency: 'CNY',
                status: 'DRAFT',
              },
            ],
            total: 1,
          })
        : Promise.resolve(empty),
    );

    const groups = await loadContractRelatedDocs('c1');

    expect(groups.map((group) => group.title)).toEqual([
      '采购单',
      '入库单',
      '费用报销',
    ]);
    expect(mocks.stockIns).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'c1' }),
    );
    const [order] = groups[0]!.rows;
    expect(order).toMatchObject({ code: 'PO-1', voided: true });
    expect(groups[0]!.columns).not.toContain('状态');
    expect(groups[1]!.rows[0]!.cells).toEqual([
      '采购入库',
      '主仓',
      '甲厂',
      '瑜伽垫',
      '2026-10-01',
    ]);
  });

  it('某类读不到时不影响其它类型，全部失败才报错', async () => {
    mocks.finance.mockRejectedValue(new Error('无权限'));
    mocks.stockOuts.mockResolvedValue({
      list: [
        {
          id: 's1',
          code: 'CK-1',
          kind: 'SALES',
          status: 'SHIPPED',
          warehouseName: '主仓',
          lines: [],
          shippedDate: '2026-10-02',
        },
      ],
      total: 3,
    });

    const groups = await loadContractRelatedDocs('c1');
    expect(groups.map((group) => [group.title, group.total])).toEqual([
      ['出库单', 3],
    ]);

    mocks.business.mockRejectedValue(new Error('断网'));
    mocks.stockIns.mockRejectedValue(new Error('断网'));
    mocks.stockOuts.mockRejectedValue(new Error('断网'));
    await expect(loadContractRelatedDocs('c1')).rejects.toThrow('断网');
  });
});
