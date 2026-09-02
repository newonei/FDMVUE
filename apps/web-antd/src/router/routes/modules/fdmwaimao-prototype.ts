import type { RouteRecordRaw } from 'vue-router';

import { createFdmTradeDocumentDetailRoute } from '../../fdm-trade-prototype-routing';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmwaimao',
    name: 'FdmWaimaoPrototype',
    redirect: '/fdmwaimao/customer',
    meta: {
      title: '外贸部门',
      icon: 'lucide:globe-2',
      hideInMenu: true,
      order: 8,
    },
    children: [
      {
        path: 'workbench',
        name: 'FdmWaimaoPrototypeWorkbench',
        component: () => import('#/views/fdmwaimao/workbench/index.vue'),
        meta: {
          title: '外贸工作台',
          icon: 'lucide:layout-dashboard',
        },
      },
      {
        path: 'customer',
        name: 'FdmWaimaoPrototypeCustomer',
        component: () => import('#/views/fdmwaimao/customer/index.vue'),
        meta: {
          title: '交易客户',
          icon: 'lucide:users-round',
          prototypePageKey: 'customer',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'customer/detail/:id',
        name: 'FdmWaimaoPrototypeCustomerDetail',
        title: '交易客户详情',
        activePath: '/fdmwaimao/customer',
        prototypePageKey: 'customer',
      }),
      {
        path: 'contract-order',
        name: 'FdmWaimaoPrototypeContractOrder',
        component: () => import('#/views/fdmwaimao/contract-order/index.vue'),
        meta: {
          title: '合同订单',
          icon: 'lucide:file-signature',
          prototypePageKey: 'contract-order',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'contract-order/detail/:id',
        name: 'FdmWaimaoPrototypeContractOrderDetail',
        title: '合同订单执行中心',
        activePath: '/fdmwaimao/contract-order',
        prototypePageKey: 'contract-order',
      }),
      {
        path: 'demand-analysis',
        name: 'FdmWaimaoPrototypeDemandAnalysis',
        component: () => import('#/views/fdmwaimao/demand-analysis/index.vue'),
        meta: {
          title: 'AI 需求分析',
          icon: 'lucide:sparkles',
          prototypePageKey: 'demand-analysis',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'demand-analysis/detail/:id',
        name: 'FdmWaimaoPrototypeDemandAnalysisDetail',
        title: '需求拆分详情',
        activePath: '/fdmwaimao/demand-analysis',
        prototypePageKey: 'demand-analysis',
      }),
    ],
  },
];

export default routes;
