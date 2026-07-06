import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmperformance',
    name: 'FdmPerformance',
    redirect: '/fdmperformance/dashboard',
    meta: {
      title: '智能绩效',
      icon: 'lucide:chart-no-axes-combined',
      hideInMenu: true,
      order: 20,
    },
    children: [
      {
        path: 'dashboard',
        name: 'FdmPerformanceDashboard',
        meta: {
          title: '首页',
          icon: 'lucide:layout-dashboard',
        },
        component: () => import('#/views/fdmperformance/dashboard/index.vue'),
      },
      {
        path: 'templates',
        name: 'FdmPerformanceTemplates',
        meta: {
          title: '考评表',
          icon: 'lucide:file-check-2',
        },
        component: () => import('#/views/fdmperformance/templates/index.vue'),
      },
      {
        path: 'goals',
        name: 'FdmPerformanceGoals',
        meta: {
          title: '目标地图',
          icon: 'lucide:map',
        },
        component: () => import('#/views/fdmperformance/goals/index.vue'),
      },
      {
        path: 'actions',
        name: 'FdmPerformanceActions',
        meta: {
          title: '行动计划',
          icon: 'lucide:list-todo',
        },
        component: () => import('#/views/fdmperformance/actions/index.vue'),
      },
      {
        path: 'templates/:id/edit',
        name: 'FdmPerformanceTemplateEdit',
        meta: {
          title: '编辑考评表',
          hideInMenu: true,
          icon: 'lucide:pencil-line',
        },
        component: () =>
          import('#/views/fdmperformance/templates/edit/index.vue'),
      },
      {
        path: 'launch',
        name: 'FdmPerformanceLaunch',
        meta: {
          title: '发起考核',
          icon: 'lucide:send',
        },
        component: () => import('#/views/fdmperformance/launch/index.vue'),
      },
      {
        path: 'batches',
        name: 'FdmPerformanceBatches',
        meta: {
          title: '已发起考核',
          icon: 'lucide:calendar-check',
        },
        component: () => import('#/views/fdmperformance/batches/index.vue'),
      },
      {
        path: 'batches/:id',
        name: 'FdmPerformanceBatchDetail',
        meta: {
          title: '考核详情',
          hideInMenu: true,
          icon: 'lucide:list-checks',
        },
        component: () =>
          import('#/views/fdmperformance/batches/detail/index.vue'),
      },
      {
        path: 'batches/:batchId/instances/:instanceId',
        name: 'FdmPerformanceInstanceDetail',
        meta: {
          title: '单人考核详情',
          hideInMenu: true,
          icon: 'lucide:user-round-check',
        },
        component: () =>
          import('#/views/fdmperformance/batches/instance/index.vue'),
      },
      {
        path: 'indicators',
        name: 'FdmPerformanceIndicators',
        meta: {
          title: '指标库',
          icon: 'lucide:database',
        },
        component: () => import('#/views/fdmperformance/indicators/index.vue'),
      },
      {
        path: 'data-center',
        name: 'FdmPerformanceDataCenter',
        meta: {
          title: '数据中心',
          icon: 'lucide:chart-column',
        },
        component: () => import('#/views/fdmperformance/data-center/index.vue'),
      },
      {
        path: 'my',
        name: 'FdmPerformanceMy',
        meta: {
          title: '我的绩效',
          icon: 'lucide:user-check',
        },
        component: () => import('#/views/fdmperformance/my/index.vue'),
      },
      {
        path: 'settings',
        name: 'FdmPerformanceSettings',
        meta: {
          title: '系统设置',
          icon: 'lucide:settings',
        },
        component: () => import('#/views/fdmperformance/settings/index.vue'),
      },
    ],
  },
];

export default routes;
