import type { RouteRecordStringComponent } from '@vben/types';

const ACTIVE_PATH_BY_COMPONENT_NAME: Readonly<Record<string, string>> = {
  FdmProcurementRequisitionDetail: '/fdmprocurement/requisition',
  FdmProcurementRequisitionEdit: '/fdmprocurement/requisition',
  FdmProcurementRequisitionGenerate: '/fdmprocurement/requisition',
  FdmWaimaoConsumptionRecordCreate: '/fdmwaimao/receipt-record',
  FdmWaimaoConsumptionRecordDetail: '/fdmwaimao/receipt-record',
  FdmWaimaoConsumptionRecordEdit: '/fdmwaimao/receipt-record',
  FdmWaimaoContractOrderCreate: '/fdmwaimao/contract-order',
  FdmWaimaoContractOrderDetail: '/fdmwaimao/contract-order',
  FdmWaimaoContractOrderEdit: '/fdmwaimao/contract-order',
  FdmWaimaoCustomerDetail: '/fdmwaimao/customer',
  FdmWaimaoDemandPlanCreate: '/fdmwaimao/demand-analysis',
  FdmWaimaoDemandPlanDetail: '/fdmwaimao/demand-analysis',
  FdmWaimaoDemandPlanEdit: '/fdmwaimao/demand-analysis',
  FdmWaimaoReceiptRecordCreate: '/fdmwaimao/receipt-record',
  FdmWaimaoReceiptRecordDetail: '/fdmwaimao/receipt-record',
  FdmWaimaoReceiptRecordEdit: '/fdmwaimao/receipt-record',
};

/**
 * Backend menus intentionally own the real document routes, but system_menu
 * has no active_path column. Enrich only routes that the backend actually
 * returned so create/edit/detail tabs keep their owning list menu highlighted.
 */
export function applyFdmDocumentRouteMeta(
  routes: RouteRecordStringComponent[],
): RouteRecordStringComponent[] {
  return routes.map<RouteRecordStringComponent>((route) => {
    const children = route.children
      ? applyFdmDocumentRouteMeta(route.children)
      : route.children;
    const next = { ...route, children } as RouteRecordStringComponent;
    const activePath = ACTIVE_PATH_BY_COMPONENT_NAME[String(route.name || '')];
    if (!activePath) return next;
    next.meta = Object.assign({}, next.meta, {
      activePath,
      hideInMenu: true,
    });
    return next;
  });
}
