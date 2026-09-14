import type { Contract } from '#/api/fdmplatform';

import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it } from 'vitest';

import {
  businessDocumentTarget,
  businessRecordTarget,
  contractTarget,
  customsDocumentLinks,
  detailLocation,
  documentTarget,
  entityTarget,
  lineTarget,
  navigationRoute,
  relatedDocumentLinks,
  resolveDocumentRow,
  standaloneLocation,
  stockTarget,
  withoutDetailQuery,
} from './navigation';
const contract = {
  id: 'contract-a',
  code: 'HT-001',
  name: '合同甲',
  companyId: 2,
  version: 8,
  status: 'CONFIRMED',
  customerId: 'customer-a',
  customerName: '客户甲',
  allowedActions: [],
  items: [{ id: 'item-a', skuId: 'product-a', skuName: '产品甲' }],
  requests: [
    { id: 'request-a', name: '申请甲' },
    { id: 'request-b', name: '申请乙' },
  ],
  assignments: [
    {
      id: 'task-a',
      requestId: 'request-a',
      contractItemId: 'item-a',
      quantity: 10,
      method: 'BUY',
    },
  ],
  quotes: [
    {
      id: 'quote-a',
      assignmentId: 'task-a',
      supplierId: 'supplier-a',
      supplierName: '供应商甲',
      currency: 'CNY',
      unitPrice: 10,
    },
  ],
  plans: [{ id: 'plan-a', requestId: 'request-a', name: '方案甲' }],
  purchaseOrders: [
    {
      id: 'order-a',
      planId: 'plan-a',
      supplierId: 'supplier-a',
      supplierName: '供应商甲',
      lines: [
        {
          id: 'line-a',
          assignmentId: 'task-a',
          contractItemId: 'item-a',
          quoteId: 'quote-a',
        },
      ],
    },
  ],
  shipments: [
    { id: 'shipment-a', eventId: 'event-a', quantity: 10 },
    {
      id: 'return-a',
      eventId: 'event-return',
      originalShipmentId: 'shipment-a',
      quantity: 2,
    },
  ],
  finance: {
    receipts: [
      { id: 'receipt-a', amount: 100 },
      { id: 'refund-a', amount: -20, originalReceiptId: 'receipt-a' },
    ],
    invoices: [{ id: 'invoice-a', invoiceNumber: 'INV-01' }],
  },
} as unknown as Contract;
describe('stable related-document navigation', () => {
  it('routes independent native invoice and stock records to their actual business type and clears stale identities', () => {
    expect(
      navigationRoute(businessRecordTarget('PURCHASE_INVOICE', 'invoice/a')!),
    ).toEqual({
      path: '/caiwu/platform-invoices',
      query: { invoiceType: 'PURCHASE', standaloneId: 'invoice/a' },
    });
    expect(
      navigationRoute(businessRecordTarget('STOCK_OUT', 'stock-out')!),
    ).toEqual({
      path: '/gongchang/platform-stock',
      query: { inventoryType: 'stock-outs', standaloneId: 'stock-out' },
    });
    expect(businessRecordTarget('UNSUPPORTED', 'a')).toBeUndefined();
    expect(businessRecordTarget('RECEIPT', '')).toBeUndefined();
    expect(
      withoutDetailQuery({
        standaloneId: 'old',
        documentId: 'old-child',
        keyword: 'SIM',
      }),
    ).toEqual({ keyword: 'SIM' });
  });
  it('locates a standalone native document without inventing a contract', async () => {
    const target = businessDocumentTarget('orders', '采购 / A?1')!;
    const location = navigationRoute(target);
    expect(location).toEqual({
      path: '/fdmprocurement/platform-orders',
      query: { standaloneId: '采购 / A?1' },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: location.path, component: {} }],
    });
    await router.push(location);
    expect(standaloneLocation(router.currentRoute.value.query)).toBe(
      '采购 / A?1',
    );
    expect(router.currentRoute.value.fullPath).toContain('%E9%87%87');
    expect(
      withoutDetailQuery({
        standaloneId: 'old',
        contractId: 'real',
        keyword: '供应商',
      }),
    ).toEqual({ contractId: 'real', keyword: '供应商' });
    expect(businessDocumentTarget('orders', ['bad'])).toBeUndefined();
    expect(() => standaloneLocation({ standaloneId: ['a', 'b'] })).toThrow(
      '单据链接无效',
    );
    expect(() =>
      standaloneLocation({ standaloneId: 'a', documentId: 'b' }),
    ).toThrow('冲突');
  });
  it('uses exact document identity and opens tasks in the execution queue', () => {
    expect(
      navigationRoute(documentTarget('tasks', 'contract-a', 'task-a')!),
    ).toEqual({
      path: '/fdmprocurement/platform-tasks',
      query: { contractId: 'contract-a', documentId: 'task-a', queue: 'tasks' },
    });
  });
  it('supports contract and all real master detail routes', () => {
    expect(navigationRoute(contractTarget('contract-a')!).query).toEqual({
      contractId: 'contract-a',
    });
    for (const type of ['customer', 'supplier', 'product'] as const)
      expect(navigationRoute(entityTarget(type, 'identity')!).query).toEqual({
        [`${type}Id`]: 'identity',
      });
    expect(entityTarget('product', undefined)).toBeUndefined();
    expect(contractTarget(12)).toBeUndefined();
  });
  it('rejects malformed, repeated, and parentless document links', () => {
    expect(detailLocation({})).toBeUndefined();
    expect(() =>
      detailLocation({ documentId: ['a', 'b'], contractId: 'a' }),
    ).toThrow('单据链接无效');
    expect(() => detailLocation({ documentId: 'a' })).toThrow(
      '单据链接缺少关联合同',
    );
    expect(
      detailLocation({ contractId: 'contract-a', documentId: 'request-b' }),
    ).toEqual({ contractId: 'contract-a', documentId: 'request-b' });
  });
  it('resolves exact target from full contract independently of page and search results', () => {
    const row = resolveDocumentRow(contract, 'requests', 'request-b');
    expect(row.record.name).toBe('申请乙');
    expect(row.contractVersion).toBe(8);
    expect(row.contractId).toBe('contract-a');
    expect(() => resolveDocumentRow(contract, 'orders', 'request-b')).toThrow(
      '当前单据已变化或不属于此类型',
    );
    expect(() =>
      resolveDocumentRow(contract, 'requests', 'foreign-id'),
    ).toThrow('当前单据已变化或不属于此类型');
  });
  it('closing a detail preserves existing list context without changing history object', () => {
    const before = {
      contractId: 'contract-a',
      documentId: 'request-b',
      queue: 'tasks',
    };
    expect(withoutDetailQuery(before)).toEqual({
      contractId: 'contract-a',
      queue: 'tasks',
    });
    expect(before.documentId).toBe('request-b');
  });
  it('links purchase order through actual plan request quote supplier and product relationships', () => {
    const links = relatedDocumentLinks(
      contract,
      'orders',
      contract.purchaseOrders![0]!,
    );
    expect(links.map((link) => link.target)).toEqual(
      expect.arrayContaining([
        documentTarget('plans', 'contract-a', 'plan-a'),
        documentTarget('requests', 'contract-a', 'request-a'),
        documentTarget('quotes', 'contract-a', 'quote-a'),
        entityTarget('supplier', 'supplier-a'),
        entityTarget('product', 'product-a'),
      ]),
    );
    expect(
      links.some(
        (link) =>
          link.target.type === 'document' &&
          link.target.documentId === 'request-b',
      ),
    ).toBe(false);
    expect(new Set(links.map((link) => JSON.stringify(link.target))).size).toBe(
      links.length,
    );
  });
  it('resolves legacy returns and allocations to the correct source type', () => {
    expect(resolveDocumentRow(contract, 'salesReturns', 'return-a').id).toBe(
      'return-a',
    );
    expect(
      relatedDocumentLinks(contract, 'allocations', {
        id: 'allocation-a',
        receiptId: 'refund-a',
        invoiceId: 'invoice-a',
      }).map((link) => link.target),
    ).toEqual(
      expect.arrayContaining([
        documentTarget('refunds', 'contract-a', 'refund-a'),
        documentTarget('invoices', 'contract-a', 'invoice-a'),
      ]),
    );
  });
  it('maps customs shipment event references to actual record IDs', () => {
    const links = customsDocumentLinks(contract, {
      id: 'customs-a',
      purchaseOrderIds: ['order-a'],
      shipments: [{ eventId: 'event-a' }, { eventId: 'missing' }],
    });
    expect(links.map((link) => link.target)).toEqual([
      documentTarget('orders', 'contract-a', 'order-a'),
      documentTarget('shipments', 'contract-a', 'shipment-a'),
    ]);
  });
  it('makes product and supplier cells clickable only when a real ID exists', () => {
    expect(
      lineTarget(contract, 'productName', { contractItemId: 'item-a' }),
    ).toEqual(entityTarget('product', 'product-a'));
    expect(
      lineTarget(contract, 'supplierName', { quoteId: 'quote-a' }),
    ).toEqual(entityTarget('supplier', 'supplier-a'));
    expect(
      lineTarget(contract, 'productName', { contractItemId: 'missing' }),
    ).toBeUndefined();
  });
  it('opens the real stock menu with exact pool and optional event identity', () => {
    expect(navigationRoute(stockTarget('pool-a')!)).toEqual({
      path: '/gongchang/platform-stock',
      query: { poolId: 'pool-a' },
    });
    expect(navigationRoute(stockTarget('pool-a', 'event-a')!).query).toEqual({
      poolId: 'pool-a',
      eventId: 'event-a',
    });
  });
  it('rejects malformed stock references instead of dropping the requested event', () => {
    expect(stockTarget(undefined, 'event-a')).toBeUndefined();
    expect(stockTarget(['pool-a'])).toBeUndefined();
    expect(stockTarget('pool-a', '')).toBeUndefined();
    expect(stockTarget('pool-a', null)).toBeUndefined();
    expect(stockTarget('pool-a', ['event-a'])).toBeUndefined();
  });
  it('lets the router encode stock IDs once and round-trips reserved characters', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/gongchang/platform-stock', component: {} }],
    });
    const target = stockTarget('pool /库存&one', 'event#1?part=2%')!;
    const resolved = router.resolve(navigationRoute(target));
    expect(resolved.href).toContain('poolId=pool+/');
    expect(resolved.href).toContain('%26one');
    expect(resolved.href).toContain('eventId=event%231?part=2%25');
    await router.push(resolved.href);
    expect(router.currentRoute.value.query).toEqual({
      poolId: 'pool /库存&one',
      eventId: 'event#1?part=2%',
    });
  });
  it('switches stock to a document with a clean query and restores stock on back', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/gongchang/platform-stock', component: {} },
        { path: '/fdmprocurement/platform-orders', component: {} },
      ],
    });
    await router.push(navigationRoute(stockTarget('pool-a', 'event-a')!));
    await router.push(
      navigationRoute(documentTarget('orders', 'contract-a', 'order-a')!),
    );
    expect(router.currentRoute.value.query).toEqual({
      contractId: 'contract-a',
      documentId: 'order-a',
    });
    const backCompleted = new Promise<void>((resolve) => {
      const remove = router.afterEach(() => {
        remove();
        resolve();
      });
    });
    router.back();
    await backCompleted;
    expect(router.currentRoute.value.query).toEqual({
      poolId: 'pool-a',
      eventId: 'event-a',
    });
  });
});
