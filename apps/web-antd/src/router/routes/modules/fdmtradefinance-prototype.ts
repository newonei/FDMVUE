import type { RouteRecordRaw } from 'vue-router';

import { createFdmTradeDocumentDetailRoute } from '../../fdm-trade-prototype-routing';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmtradefinance',
    name: 'FdmTradeFinancePrototype',
    redirect: '/fdmtradefinance/receipt-writeoff',
    meta: {
      title: '财务部门',
      icon: 'lucide:landmark',
      badge: '原型',
      badgeType: 'normal',
      order: 11,
    },
    children: [
      {
        path: 'receipt-writeoff',
        name: 'FdmTradeFinancePrototypeReceiptWriteoff',
        component: () =>
          import('#/views/fdmtradefinance/receipt-writeoff/index.vue'),
        meta: {
          title: '回款与冲销',
          icon: 'lucide:badge-dollar-sign',
          prototypePageKey: 'receipt-writeoff',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'receipt-writeoff/detail/:id',
        name: 'FdmTradeFinancePrototypeReceiptWriteoffDetail',
        title: '回款与冲销详情',
        activePath: '/fdmtradefinance/receipt-writeoff',
        prototypePageKey: 'receipt-writeoff',
      }),
      {
        path: 'payable-expense',
        name: 'FdmTradeFinancePrototypePayableExpense',
        component: () =>
          import('#/views/fdmtradefinance/payable-expense/index.vue'),
        meta: {
          title: '应付与费用',
          icon: 'lucide:receipt-text',
          prototypePageKey: 'payable-expense',
        },
      },
      createFdmTradeDocumentDetailRoute({
        path: 'payable-expense/detail/:id',
        name: 'FdmTradeFinancePrototypePayableExpenseDetail',
        title: '应付与费用详情',
        activePath: '/fdmtradefinance/payable-expense',
        prototypePageKey: 'payable-expense',
      }),
    ],
  },
];

export default routes;
