import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmwaimaocrm',
    name: 'FdmWaimaoCrmCenter',
    meta: {
      title: '外贸 CRM',
      icon: 'simple-icons:civicrm',
      keepAlive: true,
      hideInMenu: true,
    },
    children: [
      {
        path: 'clue/detail/:id',
        name: 'FdmWaimaoCrmClueDetail',
        meta: {
          title: '线索详情',
          activePath: '/fdmwaimaocrm/clue',
        },
        component: () => import('#/views/fdmwaimaocrm/clue/detail/index.vue'),
      },
      {
        path: 'customer/detail/:id',
        name: 'FdmWaimaoCrmCustomerDetail',
        meta: {
          title: '客户详情',
          activePath: '/fdmwaimaocrm/customer',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/customer/detail/index.vue'),
      },
      {
        path: 'business/detail/:id',
        name: 'FdmWaimaoCrmBusinessDetail',
        meta: {
          title: '商机详情',
          activePath: '/fdmwaimaocrm/business',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/business/detail/index.vue'),
      },
      {
        path: 'contract/detail/:id',
        name: 'FdmWaimaoCrmContractDetail',
        meta: {
          title: '合同详情',
          activePath: '/fdmwaimaocrm/contract',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/contract/detail/index.vue'),
      },
      {
        path: 'receivable-plan/detail/:id',
        name: 'FdmWaimaoCrmReceivablePlanDetail',
        meta: {
          title: '回款计划详情',
          activePath: '/fdmwaimaocrm/receivable-plan',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/receivable/plan/detail/index.vue'),
      },
      {
        path: 'receivable/detail/:id',
        name: 'FdmWaimaoCrmReceivableDetail',
        meta: {
          title: '回款详情',
          activePath: '/fdmwaimaocrm/receivable',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/receivable/detail/index.vue'),
      },
      {
        path: 'contact/detail/:id',
        name: 'FdmWaimaoCrmContactDetail',
        meta: {
          title: '联系人详情',
          activePath: '/fdmwaimaocrm/contact',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/contact/detail/index.vue'),
      },
      {
        path: 'product/detail/:id',
        name: 'FdmWaimaoCrmProductDetail',
        meta: {
          title: '产品详情',
          activePath: '/fdmwaimaocrm/product',
        },
        component: () =>
          import('#/views/fdmwaimaocrm/product/detail/index.vue'),
      },
    ],
  },
];

export default routes;
