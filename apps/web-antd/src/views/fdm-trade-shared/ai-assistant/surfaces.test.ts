import { describe, expect, it } from 'vitest';

import {
  FDM_WAIMAO_AI_SURFACES,
  isFdmProcurementAiPath,
  isFdmWaimaoAiPath,
  procurementAiQueryPermission,
  resolvedFdmWaimaoAiDescription,
  resolvedFdmWaimaoAiQuestions,
  resolveFdmWaimaoAiSurface,
} from './surfaces';

describe('fdmwaimao AI surface routes', () => {
  it.each([
    ['/fdmwaimao/customer', 'customer', 'list', undefined],
    ['/fdmwaimao/customer/detail/101', 'customer', 'detail', '101'],
    ['/fdmwaimao/contract-order', 'contract-order', 'list', undefined],
    ['/fdmwaimao/contract-order/create', 'contract-order', 'form', undefined],
    ['/fdmwaimao/contract-order/edit/201', 'contract-order', 'form', '201'],
    ['/fdmwaimao/contract-order/detail/202', 'contract-order', 'detail', '202'],
    ['/fdmwaimao/demand-analysis', 'demand-plan', 'list', undefined],
    ['/fdmwaimao/demand-analysis/create', 'demand-plan', 'form', undefined],
    ['/fdmwaimao/demand-analysis/edit/204', 'demand-plan', 'form', '204'],
    ['/fdmwaimao/demand-analysis/detail/203', 'demand-plan', 'detail', '203'],
    ['/fdmwaimao/receipt-record', 'receipt-record', 'list', undefined],
    ['/fdmwaimao/receipt-record/create', 'receipt-record', 'form', undefined],
    ['/fdmwaimao/receipt-record/edit/301', 'receipt-record', 'form', '301'],
    ['/fdmwaimao/receipt-record/detail/302', 'receipt-record', 'detail', '302'],
    [
      '/fdmwaimao/receipt-record/consumption/create',
      'receipt-record',
      'form',
      undefined,
    ],
    [
      '/fdmwaimao/receipt-record/consumption/edit/401',
      'receipt-record',
      'form',
      '401',
    ],
    [
      '/fdmwaimao/receipt-record/consumption/detail/402',
      'receipt-record',
      'detail',
      '402',
    ],
    ['/fdmwaimao/exchange-rate', 'exchange-rate', 'list', undefined],
    ['/fdmwaimao/order-expense', 'order-expense', 'list', undefined],
    ['/fdmwaimao/shipment', 'shipment', 'list', undefined],
    ['/fdmwaimao/shipment/detail/601', 'shipment', 'detail', '601'],
    [
      '/fdmprocurement/requisition',
      'procurement-requisition',
      'list',
      undefined,
    ],
    [
      '/fdmprocurement/requisition/generate',
      'procurement-requisition',
      'form',
      undefined,
    ],
    [
      '/fdmprocurement/requisition/edit/501',
      'procurement-requisition',
      'form',
      '501',
    ],
    [
      '/fdmprocurement/requisition/detail/502',
      'procurement-requisition',
      'detail',
      '502',
    ],
    [
      '/fdmprocurement/sourcing/generate',
      'procurement-sourcing',
      'form',
      undefined,
    ],
    ['/fdmprocurement/sourcing/601', 'procurement-sourcing', 'detail', '601'],
    ['/fdmprocurement/supplier', 'procurement-supplier', 'list', undefined],
    [
      '/fdmprocurement/supplier-product',
      'procurement-supplier-product',
      'list',
      undefined,
    ],
    [
      '/fdmprocurement/supplier-quote',
      'procurement-supplier-quote',
      'list',
      undefined,
    ],
  ] as const)(
    'resolves %s',
    (path, expectedSurface, expectedMode, expectedBusinessId) => {
      const resolved = resolveFdmWaimaoAiSurface(path);
      expect(resolved?.surface.key).toBe(expectedSurface);
      expect(resolved?.contextMode).toBe(expectedMode);
      expect(resolved?.businessId).toBe(expectedBusinessId);
    },
  );

  it('separates receipt and consumption conversations on the shared list route', () => {
    const receipt = resolveFdmWaimaoAiSurface('/fdmwaimao/receipt-record', {
      type: 'receipt',
    });
    const consumption = resolveFdmWaimaoAiSurface('/fdmwaimao/receipt-record', {
      type: 'consumption',
    });

    expect(receipt).toMatchObject({
      pageKey: 'receipt-record',
      sessionSurfaceKey: 'receipt-record:receipt',
      variant: 'receipt',
    });
    expect(consumption).toMatchObject({
      pageKey: 'consumption-record',
      pageTitle: '消费记录',
      sessionSurfaceKey: 'receipt-record:consumption',
      variant: 'consumption',
    });
  });

  it('defaults the shared page to direct receipt when no query is present', () => {
    expect(
      resolveFdmWaimaoAiSurface('/fdmwaimao/receipt-record'),
    ).toMatchObject({
      pageKey: 'receipt-record',
      queryPermission: 'fdmwaimao:receipt-record:query',
      sessionSurfaceKey: 'receipt-record:receipt',
      surface: { key: 'receipt-record' },
      variant: 'receipt',
    });
  });

  it.each(['bank', 'allocation'])(
    'maps the removed %s workspace to the direct receipt session',
    (workspace) => {
      expect(
        resolveFdmWaimaoAiSurface('/fdmwaimao/receipt-record', {
          type: 'consumption',
          workspace,
        }),
      ).toMatchObject({
        businessId: undefined,
        contextMode: 'list',
        pageKey: 'receipt-record',
        pageTitle: '回款记录',
        queryPermission: 'fdmwaimao:receipt-record:query',
        sessionSurfaceKey: 'receipt-record:receipt',
        surface: { availability: 'enabled', key: 'receipt-record' },
        variant: 'receipt',
      });
    },
  );

  it('uses the audited procurement page keys', () => {
    expect(
      resolveFdmWaimaoAiSurface('/fdmprocurement/requisition/detail/502')
        ?.pageKey,
    ).toBe('procurement-requisition');
    expect(
      resolveFdmWaimaoAiSurface('/fdmprocurement/sourcing/generate')?.pageKey,
    ).toBe('procurement-sourcing');
    expect(
      resolveFdmWaimaoAiSurface('/fdmprocurement/requisition/detail/502')
        ?.surface,
    ).toMatchObject({
      availability: 'serverContextUnavailable',
      disabledReason: expect.stringContaining('typed AI context provider'),
    });
  });

  it('maps procurement assistant visibility to the domain query permission', () => {
    expect(
      procurementAiQueryPermission('/fdmprocurement/requisition/detail/502'),
    ).toBe('fdmprocurement:requisition:query');
    expect(
      procurementAiQueryPermission('/fdmprocurement/sourcing/generate'),
    ).toBe('fdmprocurement:sourcing:query');
    expect(procurementAiQueryPermission('/fdmprocurement/supplier')).toBe(
      'fdmprocurement:supplier:query',
    );
    expect(
      procurementAiQueryPermission('/fdmprocurement/supplier-product'),
    ).toBe('fdmprocurement:supplier-product:query');
    expect(procurementAiQueryPermission('/fdmprocurement/supplier-quote')).toBe(
      'fdmprocurement:supplier-quote:view-sensitive',
    );
    expect(
      procurementAiQueryPermission('/fdmpurchase/requisition'),
    ).toBeUndefined();
  });

  it('does not enable the assistant for prototype or unrelated routes', () => {
    expect(resolveFdmWaimaoAiSurface('/fdmwaimao')).toBeUndefined();
    expect(resolveFdmWaimaoAiSurface('/fdmwaimao/workbench')).toBeUndefined();
    expect(resolveFdmWaimaoAiSurface('/system/user')).toBeUndefined();
    expect(isFdmWaimaoAiPath('/fdmwaimao/customer')).toBe(true);
    expect(isFdmWaimaoAiPath('/system/user')).toBe(false);
    expect(isFdmProcurementAiPath('/fdmprocurement/requisition')).toBe(true);
    expect(isFdmProcurementAiPath('/fdmprocurement/sourcing/601')).toBe(true);
    expect(isFdmProcurementAiPath('/fdmprocurement/supplier')).toBe(true);
    expect(isFdmProcurementAiPath('/fdmpurchase/requisition')).toBe(false);
  });

  it('provides common questions and read-only boundaries for all real surfaces', () => {
    expect(Object.keys(FDM_WAIMAO_AI_SURFACES)).toEqual([
      'bank-receipt',
      'customer',
      'contract-order',
      'demand-plan',
      'receipt-record',
      'receipt-allocation',
      'exchange-rate',
      'order-expense',
      'procurement-requisition',
      'procurement-sourcing',
      'procurement-supplier',
      'procurement-supplier-product',
      'procurement-supplier-quote',
      'shipment',
    ]);
    for (const surface of Object.values(FDM_WAIMAO_AI_SURFACES)) {
      expect(surface.questions.length).toBeGreaterThanOrEqual(4);
      expect(surface.readOnlyNotice).toBeTruthy();
    }
  });

  it.each([
    ['/fdmwaimao/customer', 'fdmwaimao:customer:query'],
    ['/fdmwaimao/contract-order', 'fdmwaimao:contract-order:query'],
    ['/fdmwaimao/demand-analysis', 'fdmwaimao:demand-plan:query'],
    ['/fdmwaimao/receipt-record', 'fdmwaimao:receipt-record:query'],
    [
      '/fdmwaimao/receipt-record?workspace=bank',
      'fdmwaimao:receipt-record:query',
    ],
    [
      '/fdmwaimao/receipt-record?workspace=allocation',
      'fdmwaimao:receipt-record:query',
    ],
    [
      '/fdmwaimao/receipt-record?type=consumption',
      'fdmwaimao:consumption-record:query',
    ],
    ['/fdmwaimao/exchange-rate', 'fdmwaimao:exchange-rate:query'],
    ['/fdmwaimao/order-expense', 'fdmwaimao:order-expense:query'],
    ['/fdmwaimao/shipment', 'fdmwaimao:shipment:query'],
  ] as const)(
    'fixes the page query permission for %s',
    (rawPath, permission) => {
      const [path, search] = rawPath.split('?');
      const query = new URLSearchParams(search);
      expect(
        resolveFdmWaimaoAiSurface(path!, {
          type: query.get('type') ?? undefined,
          workspace: query.get('workspace') ?? undefined,
        })?.queryPermission,
      ).toBe(permission);
    },
  );

  it('uses policy explanations rather than pretending browser list rows are model context', () => {
    for (const path of [
      '/fdmwaimao/customer',
      '/fdmwaimao/contract-order',
      '/fdmwaimao/demand-analysis',
      '/fdmwaimao/receipt-record',
      '/fdmwaimao/exchange-rate',
      '/fdmwaimao/order-expense',
      '/fdmwaimao/shipment',
    ]) {
      const resolved = resolveFdmWaimaoAiSurface(path)!;
      expect(resolvedFdmWaimaoAiDescription(resolved)).toMatch(
        /列表页只|当前只解释/,
      );
      expect(resolvedFdmWaimaoAiQuestions(resolved)).toHaveLength(4);
      expect(
        resolvedFdmWaimaoAiQuestions(resolved).every(
          (item) => !/哪些客户|哪些合同|当前列表有哪些/.test(item.prompt),
        ),
      ).toBe(true);
    }

    for (const workspace of ['bank', 'allocation']) {
      const resolved = resolveFdmWaimaoAiSurface('/fdmwaimao/receipt-record', {
        workspace,
      })!;
      expect(resolved.surface.key).toBe('receipt-record');
      expect(resolvedFdmWaimaoAiDescription(resolved)).toContain('列表页只');
      expect(resolvedFdmWaimaoAiQuestions(resolved)).toHaveLength(4);
      expect(resolved.surface.readOnlyNotice).toContain('不会新增');
    }
  });
});
