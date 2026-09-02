import type { RouteRecordRaw } from 'vue-router';

const LEGACY_FDM_WAIMAO_CRM_VIEW_PATHS = {
  customers: '/fdmwaimao/customer',
  demand: '/fdmwaimao/customer',
  finance: '/fdmwaimao/receipt-record',
  orders: '/fdmwaimao/contract-order',
  shipment: '/fdmsupplychain/shipment-outbound',
  supply: '/fdmprocurement/requisition',
} as const;

type LegacyFdmWaimaoCrmViewQuery =
  | (null | string)[]
  | null
  | string
  | undefined;

type FdmTradePrototypePageKey =
  | 'contract-order'
  | 'customer'
  | 'demand-analysis'
  | 'follow-up-customs'
  | 'payable-expense'
  | 'purchase-order'
  | 'receipt-writeoff'
  | 'requisition'
  | 'shipment-outbound'
  | 'supplier'
  | 'supply-execution';

interface FdmTradeDocumentDetailRouteOptions {
  activePath: string;
  name: string;
  path: string;
  prototypePageKey: FdmTradePrototypePageKey;
  title: string;
}

const FDM_WAIMAO_CRM_DEFAULT_PATH = '/fdmwaimao/customer';

// Backend mode still needs a small, explicit set of frontend-owned routes.
// Dashboard and Profile are system shell pages; the trade prototype roots are
// retained until their corresponding real modules are delivered. The static
// /fdmwaimao and /fdmpurchase roots are deliberately absent because their real
// replacements now come from the backend menu tree.
const BACKEND_MIXED_STATIC_ROOT_PATHS = new Set([
  '/dashboard',
  '/fdmsupplychain',
  '/fdmtradefinance',
  '/fdmwaimaocrm-prototype',
  '/profile',
]);

const loadFdmTradeDocumentDetail = () =>
  import('#/views/fdm-trade-shared/document-detail/index.vue');

function createFdmTradeDocumentDetailRoute({
  activePath,
  name,
  path,
  prototypePageKey,
  title,
}: FdmTradeDocumentDetailRouteOptions): RouteRecordRaw {
  return {
    path,
    name,
    component: loadFdmTradeDocumentDetail,
    meta: {
      title,
      activePath,
      hideInMenu: true,
      prototypePageKey,
    },
  };
}

function resolveLegacyFdmWaimaoCrmPath(view?: LegacyFdmWaimaoCrmViewQuery) {
  const normalizedView = Array.isArray(view) ? view[0] : view;

  if (!normalizedView || normalizedView === 'default') {
    return FDM_WAIMAO_CRM_DEFAULT_PATH;
  }

  return (
    LEGACY_FDM_WAIMAO_CRM_VIEW_PATHS[
      normalizedView as keyof typeof LEGACY_FDM_WAIMAO_CRM_VIEW_PATHS
    ] ?? FDM_WAIMAO_CRM_DEFAULT_PATH
  );
}

function selectBackendMixedStaticRoutes(routes: RouteRecordRaw[]) {
  return routes.filter((route) =>
    BACKEND_MIXED_STATIC_ROOT_PATHS.has(route.path),
  );
}

export {
  createFdmTradeDocumentDetailRoute,
  FDM_WAIMAO_CRM_DEFAULT_PATH,
  LEGACY_FDM_WAIMAO_CRM_VIEW_PATHS,
  loadFdmTradeDocumentDetail,
  resolveLegacyFdmWaimaoCrmPath,
  selectBackendMixedStaticRoutes,
};
export type { FdmTradePrototypePageKey };
