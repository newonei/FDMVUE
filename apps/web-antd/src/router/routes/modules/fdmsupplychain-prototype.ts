import type { RouteRecordRaw } from 'vue-router';

import { createFdmTradeDocumentDetailRoute } from '../../fdm-trade-prototype-routing';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmsupplychain',
    name: 'FdmSupplyChainPrototype',
    redirect: '/fdmsupplychain/supply-execution',
    meta: {
      title: '供应链部门',
      icon: 'lucide:network',
      badge: '原型',
      badgeType: 'normal',
      order: 10,
    },
    children: [
      {
        path: 'supply-execution',
        name: 'FdmSupplyChainPrototypeSupplyExecution',
        component: () =>
          import('#/views/fdmsupplychain/supply-execution/index.vue'),
        meta: {
          title: '供给执行',
          icon: 'lucide:factory',
          prototypePageKey: 'supply-execution',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'supply-execution/detail/:id',
        name: 'FdmSupplyChainPrototypeSupplyExecutionDetail',
        title: '供给执行详情',
        activePath: '/fdmsupplychain/supply-execution',
        prototypePageKey: 'supply-execution',
      }),
      {
        path: 'shipment-outbound',
        name: 'FdmSupplyChainPrototypeShipmentOutbound',
        component: () =>
          import('#/views/fdmsupplychain/shipment-outbound/index.vue'),
        meta: {
          title: '发货与出库',
          icon: 'lucide:container',
          prototypePageKey: 'shipment-outbound',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'shipment-outbound/detail/:id',
        name: 'FdmSupplyChainPrototypeShipmentOutboundDetail',
        title: '发货与出库详情',
        activePath: '/fdmsupplychain/shipment-outbound',
        prototypePageKey: 'shipment-outbound',
      }),
    ],
  },
];

export default routes;
