import type { RouteRecordRaw } from 'vue-router';

import { createFdmTradeDocumentDetailRoute } from '../../fdm-trade-prototype-routing';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmpurchase',
    name: 'FdmPurchasePrototype',
    redirect: '/fdmpurchase/supplier',
    meta: {
      title: '采购部门',
      icon: 'lucide:shopping-cart',
      badge: '原型',
      badgeType: 'normal',
      order: 9,
    },
    children: [
      {
        path: 'supplier',
        name: 'FdmPurchasePrototypeSupplier',
        component: () => import('#/views/fdmpurchase/supplier/index.vue'),
        meta: {
          title: '供应商',
          icon: 'lucide:building-2',
          prototypePageKey: 'supplier',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'supplier/detail/:id',
        name: 'FdmPurchasePrototypeSupplierDetail',
        title: '供应商详情',
        activePath: '/fdmpurchase/supplier',
        prototypePageKey: 'supplier',
      }),
      {
        path: 'requisition',
        name: 'FdmPurchasePrototypeRequisition',
        component: () => import('#/views/fdmpurchase/requisition/index.vue'),
        meta: {
          title: '采购申请',
          icon: 'lucide:clipboard-plus',
          prototypePageKey: 'requisition',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'requisition/detail/:id',
        name: 'FdmPurchasePrototypeRequisitionDetail',
        title: '采购申请详情',
        activePath: '/fdmpurchase/requisition',
        prototypePageKey: 'requisition',
      }),
      {
        path: 'order',
        name: 'FdmPurchasePrototypeOrder',
        component: () => import('#/views/fdmpurchase/order/index.vue'),
        meta: {
          title: '采购订单',
          icon: 'lucide:file-check-2',
          prototypePageKey: 'purchase-order',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'order/detail/:id',
        name: 'FdmPurchasePrototypeOrderDetail',
        title: '采购订单详情',
        activePath: '/fdmpurchase/order',
        prototypePageKey: 'purchase-order',
      }),
      {
        path: 'follow-up-customs',
        name: 'FdmPurchasePrototypeFollowUpCustoms',
        component: () =>
          import('#/views/fdmpurchase/follow-up-customs/index.vue'),
        meta: {
          title: '采购跟单与报关',
          icon: 'lucide:ship-wheel',
          prototypePageKey: 'follow-up-customs',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'follow-up-customs/detail/:id',
        name: 'FdmPurchasePrototypeFollowUpCustomsDetail',
        title: '跟单与报关详情',
        activePath: '/fdmpurchase/follow-up-customs',
        prototypePageKey: 'follow-up-customs',
      }),
    ],
  },
];

export default routes;
