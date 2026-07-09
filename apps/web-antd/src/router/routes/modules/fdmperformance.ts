import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmperformance',
    name: 'FdmPerformance',
    redirect: '/fdmperformance/my',
    meta: {
      title: '智能绩效',
      icon: 'lucide:chart-no-axes-combined',
      hideInMenu: true,
      order: 20,
    },
    children: [
      {
        path: 'my',
        name: 'FdmPerformanceMy',
        meta: { title: '我的绩效', icon: 'lucide:user-check' },
        component: () => import('#/views/fdmperformance/my/index.vue'),
      },
      {
        path: 'indicators',
        name: 'FdmPerformanceIndicators',
        meta: { title: '指标库', icon: 'lucide:database' },
        component: () => import('#/views/fdmperformance/indicators/index.vue'),
      },
      {
        path: 'templates',
        name: 'FdmPerformanceTemplates',
        meta: { title: '考评表', icon: 'lucide:file-check-2' },
        component: () => import('#/views/fdmperformance/templates/index.vue'),
      },
      {
        path: 'launch',
        name: 'FdmPerformanceLaunch',
        meta: { title: '发起考核', icon: 'lucide:send' },
        component: () => import('#/views/fdmperformance/launch/index.vue'),
      },
      {
        path: 'batches',
        name: 'FdmPerformanceBatches',
        meta: { title: '考核管理', icon: 'lucide:calendar-check' },
        component: () => import('#/views/fdmperformance/batches/index.vue'),
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
        path: 'results',
        name: 'FdmPerformanceResults',
        meta: { title: '结果与复盘', icon: 'lucide:chart-column' },
        component: () => import('#/views/fdmperformance/results/index.vue'),
      },
      {
        path: 'settings',
        name: 'FdmPerformanceSettings',
        meta: { title: '系统设置', icon: 'lucide:settings' },
        component: () => import('#/views/fdmperformance/settings/index.vue'),
      },
    ],
  },
];

export default routes;
