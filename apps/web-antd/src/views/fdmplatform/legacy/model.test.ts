import type { LegacyRecord, LegacySummary } from '#/api/fdmplatform/legacy';

import { describe, expect, it } from 'vitest';

import {
  allLegacyKinds,
  legacyAmount,
  legacyCount,
  legacyDateError,
  legacyDefaultMode,
  legacyDocumentKinds,
  legacyModeQuery,
  legacyNativeTarget,
  legacyRecordName,
  legacyText,
  legacyWorkspaceKinds,
} from './model';

function record(data: Partial<LegacyRecord> = {}): LegacyRecord {
  return {
    id: 'old-1',
    kind: 'CONTRACT',
    externalId: '123',
    documentNo: 'JZ-001',
    title: '历史合同',
    partyName: null,
    companyName: null,
    businessDate: null,
    sourceStatus: '结束',
    amount: null,
    amountLabel: '总金额',
    currency: null,
    rowCount: 1,
    issueCount: 0,
    nativeType: null,
    nativeId: null,
    ...data,
  };
}

describe('金智历史入口与显示口径', () => {
  it('17种原表保留独立类别，供应商发票不混入销售开票', () => {
    expect(new Set(allLegacyKinds).size).toBe(17);
    expect(legacyDocumentKinds('invoices')).toEqual(['SALES_INVOICE']);
    expect(legacyDocumentKinds('quotes')).toEqual([]);
    expect(legacyDocumentKinds('refunds')).toEqual(['REFUND']);
  });
  it('库存入口包含原库存、出入库与盘点，发货入口保留出库层', () => {
    expect(legacyWorkspaceKinds('inventory-stock')).toEqual([
      'STOCK_BALANCE',
      'STOCK_IN',
      'STOCK_OUT',
      'STOCKTAKE',
    ]);
    expect(legacyDocumentKinds('shipments')).toEqual(['SHIPMENT', 'STOCK_OUT']);
    expect(legacyWorkspaceKinds('admin-access')).toEqual([]);
  });
  it('默认显示有来源的历史，空批次保留当前新建流程', () => {
    expect(legacyDefaultMode({}, 25)).toBe('legacy');
    expect(legacyDefaultMode({}, 0)).toBe('current');
    expect(legacyDefaultMode({ dataSource: 'current' }, 25)).toBe('current');
  });
  it('原生单据、产品、库存深链总能抵达已有办理落点', () => {
    for (const query of [
      { contractId: 'contract' },
      { documentId: 'document' },
      { productId: 'product' },
      { poolId: 'pool', eventId: 'event' },
    ]) {
      expect(legacyDefaultMode({ dataSource: 'legacy', ...query }, 25)).toBe(
        'current',
      );
    }
  });
  it('独立采购付款深链和切换后的来源清理保留正确上下文', () => {
    expect(legacyDefaultMode({ financeId: 'payment' }, 20)).toBe('current');
    const query = {
      financeId: 'payment',
      orderId: 'order',
      contractId: 'contract',
      keyword: '留存搜索',
    };
    const history = legacyModeQuery(query, 'legacy');
    expect(history).toEqual({ keyword: '留存搜索', dataSource: 'legacy' });
    expect(query.financeId).toBe('payment');
  });
  it('只合计当前页面提供的范围计数，不借用全局总数', () => {
    const summary: LegacySummary = {
      batchId: 'batch',
      sourceSystem: 'JINZHI',
      counts: { CONTRACT: 3, RECEIPT: 500 },
      totalRecords: 503,
      totalRows: 999,
      issueRecords: 0,
    };
    expect(legacyCount(summary, ['CONTRACT'])).toBe(3);
    expect(legacyCount(undefined, ['CONTRACT'])).toBe(0);
  });
  it('金额缺失不补零，真实零与负退款不改符号，未知币种不填CNY', () => {
    expect(legacyAmount(record())).toBe('未注明');
    expect(legacyAmount(record({ amount: 0 }))).toBe('0 （币种未注明）');
    expect(
      legacyAmount(record({ amount: '-424', currency: 'RMB', kind: 'REFUND' })),
    ).toBe('-424 RMB');
  });
  it('来源对象与布尔值保留文字，HTML字符串不解释为富文本', () => {
    expect(legacyText(false)).toBe('false');
    expect(legacyText({ 同名字段: 3 })).toBe('{"同名字段":3}');
    expect(legacyText('<img src=x onerror=alert(1)>')).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(legacyText(null)).toBe('未注明');
  });
  it('只有确认的真实主档ID才创建当前档案跳转', () => {
    expect(
      legacyNativeTarget(record({ partyName: '同名供应商' })),
    ).toBeUndefined();
    expect(
      legacyNativeTarget(
        record({ nativeType: 'SUPPLIER', nativeId: 'supplier-a' }),
      ),
    ).toEqual({ type: 'supplier', id: 'supplier-a' });
    expect(
      legacyNativeTarget(record({ nativeType: 'PRODUCT', nativeId: ' ' })),
    ).toBeUndefined();
    expect(legacyRecordName(record({ documentNo: null }))).toBe('历史合同');
  });
  it('无效日期与颠倒区间明确阻止查询，不因无效Date抛错', () => {
    expect(legacyDateError('2026-99-01', '')).toBe('请选择有效的起止日期');
    expect(legacyDateError('2026-02-30', '')).toBe('请选择有效的起止日期');
    expect(legacyDateError('2026-09-09', '2026-09-08')).toBe(
      '开始日期不能晚于结束日期',
    );
    expect(legacyDateError('', '')).toBe('');
  });
});
