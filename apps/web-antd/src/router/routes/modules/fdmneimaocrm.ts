import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmneimaocrm',
    name: 'FdmNeimaoCrmCenter',
    meta: {
      title: '内贸 CRM',
      icon: 'simple-icons:civicrm',
      keepAlive: true,
      hideInMenu: true,
    },
    children: [
      {
        path: 'clue/detail/:id',
        name: 'FdmNeimaoCrmClueDetail',
        meta: {
          title: '线索详情',
          activePath: '/fdmneimaocrm/clue',
        },
        component: () => import('#/views/fdmneimaocrm/clue/detail/index.vue'),
      },
      {
        path: 'customer/detail/:id',
        name: 'FdmNeimaoCrmCustomerDetail',
        meta: {
          title: '客户详情',
          activePath: '/fdmneimaocrm/customer',
        },
        component: () =>
          import('#/views/fdmneimaocrm/customer/detail/index.vue'),
      },
      {
        path: 'business/detail/:id',
        name: 'FdmNeimaoCrmBusinessDetail',
        meta: {
          title: '商机详情',
          activePath: '/fdmneimaocrm/business',
        },
        component: () =>
          import('#/views/fdmneimaocrm/business/detail/index.vue'),
      },
      {
        path: 'contract/detail/:id',
        name: 'FdmNeimaoCrmContractDetail',
        meta: {
          title: '合同详情',
          activePath: '/fdmneimaocrm/contract',
        },
        component: () =>
          import('#/views/fdmneimaocrm/contract/detail/index.vue'),
      },
      {
        path: 'receivable-plan/detail/:id',
        name: 'FdmNeimaoCrmReceivablePlanDetail',
        meta: {
          title: '回款计划详情',
          activePath: '/fdmneimaocrm/receivable-plan',
        },
        component: () =>
          import('#/views/fdmneimaocrm/receivable/plan/detail/index.vue'),
      },
      {
        path: 'receivable/detail/:id',
        name: 'FdmNeimaoCrmReceivableDetail',
        meta: {
          title: '回款详情',
          activePath: '/fdmneimaocrm/receivable',
        },
        component: () =>
          import('#/views/fdmneimaocrm/receivable/detail/index.vue'),
      },
      {
        path: 'contact/detail/:id',
        name: 'FdmNeimaoCrmContactDetail',
        meta: {
          title: '联系人详情',
          activePath: '/fdmneimaocrm/contact',
        },
        component: () =>
          import('#/views/fdmneimaocrm/contact/detail/index.vue'),
      },
      {
        path: 'product/detail/:id',
        name: 'FdmNeimaoCrmProductDetail',
        meta: {
          title: '产品详情',
          activePath: '/fdmneimaocrm/product',
        },
        component: () =>
          import('#/views/fdmneimaocrm/product/detail/index.vue'),
      },
    ],
  },
];

export default routes;
