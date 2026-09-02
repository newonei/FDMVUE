import type { RouteRecordStringComponent } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { applyFdmDocumentRouteMeta } from './fdm-document-route-meta';

describe('fDM backend document route meta', () => {
  it.each([
    ['FdmWaimaoCustomerDetail', '/fdmwaimao/customer'],
    ['FdmWaimaoContractOrderCreate', '/fdmwaimao/contract-order'],
    ['FdmWaimaoContractOrderEdit', '/fdmwaimao/contract-order'],
    ['FdmWaimaoContractOrderDetail', '/fdmwaimao/contract-order'],
    ['FdmWaimaoDemandPlanCreate', '/fdmwaimao/demand-analysis'],
    ['FdmWaimaoDemandPlanEdit', '/fdmwaimao/demand-analysis'],
    ['FdmWaimaoDemandPlanDetail', '/fdmwaimao/demand-analysis'],
    ['FdmWaimaoReceiptRecordCreate', '/fdmwaimao/receipt-record'],
    ['FdmWaimaoReceiptRecordEdit', '/fdmwaimao/receipt-record'],
    ['FdmWaimaoReceiptRecordDetail', '/fdmwaimao/receipt-record'],
    ['FdmWaimaoConsumptionRecordCreate', '/fdmwaimao/receipt-record'],
    ['FdmWaimaoConsumptionRecordEdit', '/fdmwaimao/receipt-record'],
    ['FdmWaimaoConsumptionRecordDetail', '/fdmwaimao/receipt-record'],
    ['FdmProcurementRequisitionGenerate', '/fdmprocurement/requisition'],
    ['FdmProcurementRequisitionEdit', '/fdmprocurement/requisition'],
    ['FdmProcurementRequisitionDetail', '/fdmprocurement/requisition'],
  ])('maps %s to its visible owner menu', (name, activePath) => {
    const routes = [
      {
        component: 'ignored',
        meta: { title: 'hidden page' },
        name,
        path: 'hidden/:id',
      },
    ] as RouteRecordStringComponent[];

    expect(applyFdmDocumentRouteMeta(routes)[0]?.meta).toMatchObject({
      activePath,
      hideInMenu: true,
    });
  });

  it('leaves visible and unrelated routes unchanged and creates no routes', () => {
    const routes = [
      {
        component: 'fdmprocurement/requisition/index',
        meta: { title: '采购申请' },
        name: 'FdmProcurementRequisition',
        path: 'requisition',
      },
    ] as RouteRecordStringComponent[];

    expect(applyFdmDocumentRouteMeta(routes)).toEqual(routes);
    expect(applyFdmDocumentRouteMeta([])).toEqual([]);
  });
});
